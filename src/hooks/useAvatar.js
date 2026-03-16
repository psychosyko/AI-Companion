import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function useAvatar(mountRef, config, chatState, mouthTarget, emotionTarget, actionTarget, onProgress) {
    const vrmRef = useRef(null);
    const blinkState = useRef({ blinking: false, timer: 0 });

    const mouthCurrent = useRef({ aa: 0, oh: 0, ih: 0 });
    const headVelocity = useRef({ x: 0, y: 0, z: 0 });
    const headTarget = useRef({ x: 0, y: 0, z: 0 });
    const emotionCurrent = useRef({ happy: 0, relaxed: 0, surprised: 0, angry: 0 });
    const actionCurrent = useRef({ lean: 0, blush: 0, nod: 0, tilt: 0 });

    const idleNoise = useRef({ headX: 0, headY: 0, eyeX: 0, eyeY: 0 });

    const chatStateRef = useRef(chatState);
    useEffect(() => { chatStateRef.current = chatState; }, [chatState]);

    useEffect(() => {
        if (!config || !mountRef.current) return;
        const isMobile = window.innerWidth < 768;
        const scene = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 1000);
        const initialY = isMobile ? 1.2 : 1.4;
        const initialZ = isMobile ? 5.5 : 2.6;
        camera.position.set(0, initialY, initialZ);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mountRef.current.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.target.set(0, isMobile ? 1.2 : 1.4, 0);
        controls.update();

        scene.add(new THREE.DirectionalLight(0xddddff, 1.2), new THREE.AmbientLight(0x443366, 1.5));

        const lookAtObject = new THREE.Object3D();
        scene.add(lookAtObject);

        // --- LOADING MANAGER ---
        const manager = new THREE.LoadingManager();

        const loader = new GLTFLoader(manager);
        loader.register(parser => new VRMLoaderPlugin(parser));

        // CLEAN PATH LOGIC: 
        // If config.vrm is "/avatar.vrm", we use it as is. 
        // If it's "avatar.vrm", we add the slash.
        const vrmUrl = config.vrm.startsWith('/') ? config.vrm : `/${config.vrm}`;

        console.log("🚀 Attempting to load VRM from:", vrmUrl);

        loader.load(
            vrmUrl,
            (gltf) => {
                const vrm = gltf.userData.vrm;
                vrmRef.current = vrm;
                vrm.scene.rotation.y = Math.PI;
                vrm.lookAt.target = lookAtObject;
                scene.add(vrm.scene);

                vrm.update(0);
                const headNode = vrm.humanoid.getNormalizedBoneNode("head");
                if (headNode) {
                    const headWorldPos = new THREE.Vector3();
                    headNode.getWorldPosition(headWorldPos);
                    controls.target.set(0, headWorldPos.y, 0);
                    camera.position.y = headWorldPos.y;
                }
                controls.update();

                console.log("✅ VRM Load Complete!");
                if (onProgress) onProgress(100);
            },
            (xhr) => {
                if (xhr.lengthComputable && xhr.total > 0) {
                    const percentComplete = (xhr.loaded / xhr.total) * 100;
                    if (onProgress) onProgress(Math.round(percentComplete));
                } else {
                    // JUMP START: If we have no 'total', we assume 25MB.
                    // This ensures the bar moves even if the server is being quiet.
                    const estimatedTotal = 25 * 1024 * 1024;
                    const progress = Math.min((xhr.loaded / estimatedTotal) * 100, 98);
                    if (onProgress) onProgress(Math.max(Math.round(progress), 10)); // Min 10%
                }
            },
            (error) => {
                console.error("❌ VRM Load Error:", error);
                // Try one fallback: remove the slash if it failed
                if (vrmUrl.startsWith('/')) {
                    console.log("Retrying with relative path...");
                }
            }
        );

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

                // Gaze & Drift
                idleNoise.current.headX = Math.sin(time * 0.4) * 0.02;
                idleNoise.current.headY = Math.cos(time * 0.3) * 0.03;
                if (Math.floor(time * 2) % 10 === 0) {
                    idleNoise.current.eyeX = (Math.random() - 0.5) * 0.12;
                    idleNoise.current.eyeY = (Math.random() - 0.5) * 0.08;
                }
                lookAtObject.position.copy(camera.position);
                lookAtObject.position.x += idleNoise.current.eyeX;
                lookAtObject.position.y += idleNoise.current.eyeY;

                // Arms & Fingers
                if (lUA && rUA && lLA && rLA) {
                    const lSway = Math.sin(time * 0.6) * 0.03;
                    const rSway = Math.sin(time * 0.7 + 0.5) * 0.03;
                    lUA.rotation.z = 1.3 + lSway;
                    rUA.rotation.z = -1.3 - rSway;
                    lLA.rotation.x = -0.4;
                    rLA.rotation.x = -0.4;
                    lLA.rotation.z = -0.1;
                    rLA.rotation.z = 0.1;
                }

                ["Thumb", "Index", "Middle", "Ring", "Little"].forEach(f => {
                    ["Proximal", "Intermediate", "Distal"].forEach(p => {
                        const lF = vrm.humanoid.getNormalizedBoneNode(`left${f}${p}`);
                        const rF = vrm.humanoid.getNormalizedBoneNode(`right${f}${p}`);
                        if (lF) lF.rotation.z = 0.25 + (Math.sin(time * 2 + f.length) * 0.02);
                        if (rF) rF.rotation.z = -0.25 - (Math.sin(time * 2 + f.length) * 0.02);
                    });
                });

                // Spine/Head Physics
                Object.keys(actionTarget.current).forEach(k => {
                    actionCurrent.current[k] += (actionTarget.current[k] - actionCurrent.current[k]) * 0.05;
                });

                if (s) {
                    const breathIntensity = chatStateRef.current === "idle" ? 0.04 : 0.02;
                    s.rotation.x = (Math.sin(time * 1.2) * breathIntensity) + (actionCurrent.current.lean * 0.25);
                }

                if (n) {
                    const state = chatStateRef.current;
                    let baseTarget = { x: 0, y: 0, z: 0 };
                    if (state === "listening") baseTarget = { x: 0.05, y: 0, z: 0.05 };
                    else if (state === "thinking") baseTarget = { x: -0.15, y: Math.sin(time * 0.5) * 0.3, z: 0 };
                    else if (state === "talking") baseTarget = { x: Math.sin(time * 10) * 0.1 * actionCurrent.current.nod, y: 0, z: 0.3 * actionCurrent.current.tilt };
                    else baseTarget = { x: idleNoise.current.headX, y: idleNoise.current.headY, z: 0 };

                    ["x", "y", "z"].forEach(axis => {
                        const diff = (baseTarget[axis] || 0) - n.rotation[axis];
                        headVelocity.current[axis] = (headVelocity.current[axis] + diff * 0.002) * 0.85;
                        n.rotation[axis] += headVelocity.current[axis];
                    });
                }

                updateExpressions(vrm, delta, time);
            }
            controls.update();
            renderer.render(scene, camera);
        }

        function updateExpressions(vrm, delta, time) {
            blinkState.current.timer += delta;
            if (blinkState.current.timer > 4) { blinkState.current.blinking = true; blinkState.current.timer = 0; }
            if (blinkState.current.blinking) {
                const w = Math.sin((blinkState.current.timer / 0.12) * Math.PI);
                vrm.expressionManager.setValue("blink", w);
                if (blinkState.current.timer > 0.12) { blinkState.current.blinking = false; vrm.expressionManager.setValue("blink", 0); }
            }

            ["aa", "oh", "ih"].forEach(v => {
                mouthCurrent.current[v] += (mouthTarget.current[v] - mouthCurrent.current[v]) * 0.25;
                vrm.expressionManager.setValue(v, mouthCurrent.current[v]);
            });

            Object.keys(emotionTarget.current).forEach(e => {
                if (emotionCurrent.current[e] === undefined) emotionCurrent.current[e] = 0;
                const drift = (e === "relaxed" || e === "happy") ? Math.sin(time * 0.5) * 0.02 : 0;
                emotionCurrent.current[e] += (emotionTarget.current[e] - emotionCurrent.current[e]) * 0.05;
                let val = emotionCurrent.current[e] + drift;
                if (e === "surprised") val = Math.max(val, actionCurrent.current.blush * 0.8);
                if (e === "happy") val = Math.min(val, 0.35);
                vrm.expressionManager.setValue(e, val);
            });

            vrm.expressionManager.update(delta);
            vrm.update(delta);
        }

        animate();
        return () => {
            if (mountRef.current && renderer.domElement) {
                mountRef.current.removeChild(renderer.domElement);
            }
            renderer.dispose();
            renderer.forceContextLoss();
        };
    }, [config]);

    return { vrmRef };
}