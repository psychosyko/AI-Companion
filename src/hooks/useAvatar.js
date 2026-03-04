import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function useAvatar(mountRef, config) {
    const vrmRef = useRef(null);
    const blinkState = useRef({ blinking: false, timer: 0 });
    const mouthTarget = useRef({ aa: 0, oh: 0, ih: 0 });
    const mouthCurrent = useRef({ aa: 0, oh: 0, ih: 0 });
    const emotionTarget = useRef({ happy: 0, relaxed: 0, surprised: 0 });
    const emotionCurrent = useRef({ happy: 0, relaxed: 0, surprised: 0 });

    const actionTarget = useRef({ lean: 0, blush: 0, nod: 0, tilt: 0 });
    const actionCurrent = useRef({ lean: 0, blush: 0, nod: 0, tilt: 0 });

    useEffect(() => {
        if (!config || !mountRef.current) return;

        const isMobile = window.innerWidth < 768;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 1000);

        if (isMobile) camera.position.set(0, 1.5, 3.5);
        else camera.position.set(0, 1.5, 2.6);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        mountRef.current.innerHTML = '';
        mountRef.current.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, isMobile ? 1 : 1.2, 0);
        controls.enableDamping = true;

        scene.add(new THREE.DirectionalLight(0xddddff, 1.2), new THREE.AmbientLight(0x443366, 1.5));

        const loader = new GLTFLoader();
        loader.register(parser => new VRMLoaderPlugin(parser));

        loader.load(`.${config.vrm}`, gltf => {
            const vrm = gltf.userData.vrm;
            vrmRef.current = vrm;
            vrm.scene.rotation.y = Math.PI;
            vrm.lookAt.target = camera;
            scene.add(vrm.scene);
            // --- ADD THIS LOG ---
            const names = vrm.expressionManager.expressions.map(e => e.expressionName);
            console.log("🎨 MODEL EXPRESSIONS:", names);
        });

        function animate() {
            requestAnimationFrame(animate);
            const delta = 1 / 60;
            const time = performance.now() / 1000;
            const vrm = vrmRef.current;

            if (vrm) {
                // --- BONE ACCESS ---
                const s = vrm.humanoid.getNormalizedBoneNode("spine");
                const n = vrm.humanoid.getNormalizedBoneNode("neck");
                const lUA = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
                const rUA = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
                const lLA = vrm.humanoid.getNormalizedBoneNode("leftLowerArm");
                const rLA = vrm.humanoid.getNormalizedBoneNode("rightLowerArm");
                const lH = vrm.humanoid.getNormalizedBoneNode("leftHand");
                const rH = vrm.humanoid.getNormalizedBoneNode("rightHand");

                // Lerp Actions
                Object.keys(actionTarget.current).forEach(key => {
                    actionCurrent.current[key] += (actionTarget.current[key] - actionCurrent.current[key]) * 0.05;
                });

                // --- 1. NATURAL ARMS & ELBOWS ---
                if (lUA && rUA && lLA && rLA) {
                    const lSway = Math.sin(time * 0.6) * 0.03;
                    const rSway = Math.sin(time * 0.7 + 0.5) * 0.03;

                    // Shoulders: A-Pose
                    lUA.rotation.z = 1.3 + lSway;
                    rUA.rotation.z = -1.3 - rSway;

                    // ELBOWS: Fix backward bend
                    // Change the 0.4 to -0.4 if they still bend the wrong way
                    lLA.rotation.x = -0.4;
                    rLA.rotation.x = -0.4;
                    lLA.rotation.z = -0.1; // Keep them close to body
                    rLA.rotation.z = 0.1;

                    // Hands/Wrists: Subtle dangles
                    if (lH && rH) {
                        lH.rotation.x = 0.2 + Math.sin(time * 0.6) * 0.05;
                        rH.rotation.x = 0.2 + Math.sin(time * 0.7) * 0.05;
                    }

                    // --- 2. PROCEDURAL FINGERS (The Relaxed Curl) ---
                    const fingerBones = ["Thumb", "Index", "Middle", "Ring", "Little"];
                    const phalanges = ["Proximal", "Intermediate", "Distal"];

                    fingerBones.forEach(f => {
                        phalanges.forEach(p => {
                            const leftF = vrm.humanoid.getNormalizedBoneNode(`left${f}${p}`);
                            const rightF = vrm.humanoid.getNormalizedBoneNode(`right${f}${p}`);

                            // A value of 0.2-0.3 creates a natural curve
                            // We add a tiny "jitter" to make them look like they are alive
                            const curl = 0.25 + (Math.sin(time * 2 + (f.length)) * 0.02);

                            if (leftF) leftF.rotation.z = curl;
                            if (rightF) rightF.rotation.z = -curl;
                        });
                    });
                }

                // 3. SPINE & NECK
                if (s) {
                    const breathing = Math.sin(time * 1.5) * 0.04;
                    s.rotation.x = breathing + (actionCurrent.current.lean * 0.25);
                }

                if (n) {
                    n.rotation.x = Math.sin(time * 10) * 0.1 * actionCurrent.current.nod;
                    n.rotation.z = 0.3 * actionCurrent.current.tilt;
                }

                updateExpressions(vrm, delta);
            }

            controls.update();
            renderer.render(scene, camera);
        }

        function updateExpressions(vrm, delta) {
            blinkState.current.timer += delta;
            if (!blinkState.current.blinking && blinkState.current.timer > 3.5) {
                blinkState.current.blinking = true;
                blinkState.current.timer = 0;
            }
            if (blinkState.current.blinking) {
                const weight = Math.sin((blinkState.current.timer / 0.12) * Math.PI);
                vrm.expressionManager.setValue("blink", weight);
                if (blinkState.current.timer > 0.12) {
                    blinkState.current.blinking = false;
                    vrm.expressionManager.setValue("blink", 0);
                }
            }
            ["aa", "oh", "ih"].forEach(v => {
                mouthCurrent.current[v] += (mouthTarget.current[v] - mouthCurrent.current[v]) * 0.25;
                vrm.expressionManager.setValue(v, mouthCurrent.current[v]);
            });
            ["happy", "relaxed", "surprised"].forEach(e => {
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
        return () => {
            cancelAnimationFrame(animationID);
            renderer.dispose();
        };
    }, [config, mountRef]);

    return { vrmRef, mouthTarget, emotionTarget, actionTarget };
}