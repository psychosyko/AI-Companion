import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function useAvatar(mountRef, config, chatState, mouthTarget, emotionTarget, actionTarget) {
    const vrmRef = useRef(null);
    const blinkState = useRef({ blinking: false, timer: 0 });
    
    // Internal 'Current' states for smoothing
    const mouthCurrent = useRef({ aa: 0, oh: 0, ih: 0 });
    const headVelocity = useRef({ x: 0, y: 0, z: 0 });
    const headTarget = useRef({ x: 0, y: 0, z: 0 });
    const emotionCurrent = useRef({ happy: 0, relaxed: 0, surprised: 0, angry: 0 });
    const actionCurrent = useRef({ lean: 0, blush: 0, nod: 0, tilt: 0 });

    const chatStateRef = useRef(chatState);
    useEffect(() => { chatStateRef.current = chatState; }, [chatState]);

    useEffect(() => {
        if (!config || !mountRef.current) return;
        const isMobile = window.innerWidth < 768;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 1.5, isMobile ? 5.5 : 2.6);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mountRef.current.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, isMobile ? 1 : 1.2, 0);
        controls.enableDamping = true;

        scene.add(new THREE.DirectionalLight(0xddddff, 1.2), new THREE.AmbientLight(0x443366, 1.5));

        new GLTFLoader().register(p => new VRMLoaderPlugin(p)).load(`.${config.vrm}`, gltf => {
            vrmRef.current = gltf.userData.vrm;
            vrmRef.current.scene.rotation.y = Math.PI;
            vrmRef.current.lookAt.target = camera;
            scene.add(vrmRef.current.scene);
        });

        function animate() {
            requestAnimationFrame(animate);
            const delta = 1 / 60;
            const time = performance.now() / 1000;
            const vrm = vrmRef.current;

            if (vrm) {
                const s = vrm.humanoid.getNormalizedBoneNode("spine");
                const n = vrm.humanoid.getNormalizedBoneNode("neck");
                const lUA = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
                const rUA = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
                const lLA = vrm.humanoid.getNormalizedBoneNode("leftLowerArm");
                const rLA = vrm.humanoid.getNormalizedBoneNode("rightLowerArm");

                // Interpolate actions
                Object.keys(actionTarget.current).forEach(k => {
                    actionCurrent.current[k] += (actionTarget.current[k] - actionCurrent.current[k]) * 0.05;
                });

                if (lUA && rUA && lLA && rLA) {
                    const lSway = Math.sin(time * 0.6) * 0.03;
                    const rSway = Math.sin(time * 0.7 + 0.5) * 0.03;
                    lUA.rotation.z = 1.3 + lSway; rUA.rotation.z = -1.3 - rSway;
                    lLA.rotation.x = -0.4; rLA.rotation.x = -0.4;
                }

                if (s) s.rotation.x = (Math.sin(time * 1.5) * 0.04) + (actionCurrent.current.lean * 0.25);

                // --- STATE-BASED PHYSICS HEAD ---
                if (n) {
                    const state = chatStateRef.current;
                    if (state === "listening") headTarget.current = { x: 0.05, y: 0, z: 0.05 }; 
                    else if (state === "thinking") headTarget.current = { x: -0.15, y: Math.sin(time * 0.5) * 0.3, z: 0 };
                    else if (state === "talking") headTarget.current = { x: Math.sin(time * 10) * 0.1 * actionCurrent.current.nod, y: 0, z: 0.3 * actionCurrent.current.tilt };
                    else headTarget.current = { x: Math.sin(time * 0.5) * 0.05, y: Math.cos(time * 0.3) * 0.1, z: 0 };

                    ["x", "y", "z"].forEach(axis => {
                        const diff = headTarget.current[axis] - n.rotation[axis];
                        headVelocity.current[axis] = (headVelocity.current[axis] + diff * 0.002) * 0.85;
                        n.rotation[axis] += headVelocity.current[axis];
                    });
                }

                // Fingers
                ["Thumb", "Index", "Middle", "Ring", "Little"].forEach(f => ["Proximal", "Intermediate", "Distal"].forEach(p => {
                    const lF = vrm.humanoid.getNormalizedBoneNode(`left${f}${p}`);
                    const rF = vrm.humanoid.getNormalizedBoneNode(`right${f}${p}`);
                    if (lF) lF.rotation.z = 0.25 + (Math.sin(time * 2 + f.length) * 0.02);
                    if (rF) rF.rotation.z = -0.25 - (Math.sin(time * 2 + f.length) * 0.02);
                }));

                updateExpressions(vrm, delta);
            }
            renderer.render(scene, camera);
        }

        function updateExpressions(vrm, delta) {
            blinkState.current.timer += delta;
            if (blinkState.current.timer > 4) { blinkState.current.blinking = true; blinkState.current.timer = 0; }
            if (blinkState.current.blinking) {
                const w = Math.sin((blinkState.current.timer / 0.12) * Math.PI);
                vrm.expressionManager.setValue("blink", w);
                if (blinkState.current.timer > 0.12) { blinkState.current.blinking = false; vrm.expressionManager.setValue("blink", 0); }
            }

            // --- THIS LINE CONNECTS TO PARENT calculation ---
            ["aa", "oh", "ih"].forEach(v => {
                mouthCurrent.current[v] += (mouthTarget.current[v] - mouthCurrent.current[v]) * 0.25;
                vrm.expressionManager.setValue(v, mouthCurrent.current[v]);
            });

            Object.keys(emotionTarget.current).forEach(e => {
                if (emotionCurrent.current[e] === undefined) emotionCurrent.current[e] = 0;
                emotionCurrent.current[e] += (emotionTarget.current[e] - emotionCurrent.current[e]) * 0.05;
                let val = emotionCurrent.current[e];
                if (e === "surprised") val = Math.max(val, actionCurrent.current.blush * 0.8);
                if (e === "happy") val = Math.min(val, 0.35);
                vrm.expressionManager.setValue(e, val);
            });

            vrm.expressionManager.update(delta);
            vrm.update(delta);
        }

        animate();
        return () => { renderer.dispose(); renderer.forceContextLoss(); };
    }, [config]);

    return { vrmRef };
}