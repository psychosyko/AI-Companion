import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * useAvatar Hook
 * Handles the 3D lifecycle of the VRM model including loading, 
 * animations (breathing, blinking, procedural movement), and physics.
 */
export function useAvatar(mountRef, config, chatState, mouthTarget, emotionTarget, actionTarget, onProgress) {
    const vrmRef = useRef(null);
    const rendererRef = useRef(null);
    const sceneRef = useRef(null);
    
    // Animation States
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

        // --- 1. INITIALIZATION ---
        const isMobile = window.innerWidth < 768;
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, isMobile ? 1.2 : 1.4, isMobile ? 5.5 : 2.6);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mountRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.target.set(0, isMobile ? 1.2 : 1.4, 0);

        scene.add(new THREE.DirectionalLight(0xddddff, 1.2), new THREE.AmbientLight(0x443366, 1.5));

        // Invisible target for the eyes to follow (allows gaze noise)
        const lookAtObject = new THREE.Object3D();
        scene.add(lookAtObject);

        // --- 2. VRM LOADING ---
        const manager = new THREE.LoadingManager();
        const loader = new GLTFLoader(manager);
        loader.register(parser => new VRMLoaderPlugin(parser));

        const vrmUrl = config.vrm.startsWith('/') ? config.vrm : `/${config.vrm}`;

        loader.load(
            vrmUrl,
            (gltf) => {
                const vrm = gltf.userData.vrm;
                vrmRef.current = vrm;
                vrm.scene.rotation.y = Math.PI;
                vrm.lookAt.target = lookAtObject;
                scene.add(vrm.scene);

                // Auto-center camera on head
                vrm.update(0);
                const head = vrm.humanoid.getNormalizedBoneNode("head");
                if (head) {
                    const headPos = new THREE.Vector3();
                    head.getWorldPosition(headPos);
                    controls.target.set(0, headPos.y, 0);
                    camera.position.y = headPos.y;
                }
                controls.update();
                if (onProgress) onProgress(100);
            },
            (xhr) => {
                if (xhr.lengthComputable && onProgress) {
                    onProgress(Math.round((xhr.loaded / xhr.total) * 100));
                } else if (onProgress) {
                    // Fallback progress simulation
                    onProgress(Math.min(Math.round((xhr.loaded / 25000000) * 100), 98));
                }
            },
            (err) => console.error("VRM Engine Error:", err)
        );

        // --- 3. ANIMATION HELPERS ---
        const updateGaze = (time, camera) => {
            idleNoise.current.headX = Math.sin(time * 0.4) * 0.02;
            idleNoise.current.headY = Math.cos(time * 0.3) * 0.03;
            if (Math.floor(time * 2) % 10 === 0) {
                idleNoise.current.eyeX = (Math.random() - 0.5) * 0.12;
                idleNoise.current.eyeY = (Math.random() - 0.5) * 0.08;
            }
            lookAtObject.position.copy(camera.position);
            lookAtObject.position.x += idleNoise.current.eyeX;
            lookAtObject.position.y += idleNoise.current.eyeY;
        };

        const updateBones = (vrm, time) => {
            const bones = {
                spine: vrm.humanoid.getNormalizedBoneNode("spine"),
                neck: vrm.humanoid.getNormalizedBoneNode("neck"),
                lUA: vrm.humanoid.getNormalizedBoneNode("leftUpperArm"),
                rUA: vrm.humanoid.getNormalizedBoneNode("rightUpperArm"),
                lLA: vrm.humanoid.getNormalizedBoneNode("leftLowerArm"),
                rLA: vrm.humanoid.getNormalizedBoneNode("rightLowerArm"),
            };

            // Interpolate Global Actions
            Object.keys(actionTarget.current).forEach(k => {
                actionCurrent.current[k] += (actionTarget.current[k] - actionCurrent.current[k]) * 0.05;
            });

            // Procedural Arm/Finger Movement
            if (bones.lUA && bones.rUA) {
                const s = Math.sin(time * 0.6) * 0.03;
                bones.lUA.rotation.z = 1.3 + s;
                bones.rUA.rotation.z = -1.3 - s;
                bones.lLA.rotation.x = bones.rLA.rotation.x = -0.4;
            }

            // Breathing & Lean
            if (bones.spine) {
                const intensity = chatStateRef.current === "idle" ? 0.04 : 0.02;
                bones.spine.rotation.x = (Math.sin(time * 1.2) * intensity) + (actionCurrent.current.lean * 0.25);
            }

            // Head Physics
            if (bones.neck) {
                const state = chatStateRef.current;
                let target = { x: idleNoise.current.headX, y: idleNoise.current.headY, z: 0 };
                
                if (state === "listening") target = { x: 0.05, y: 0, z: 0.05 };
                else if (state === "thinking") target = { x: -0.15, y: Math.sin(time * 0.5) * 0.3, z: 0 };
                else if (state === "talking") target = { x: Math.sin(time * 10) * 0.1 * actionCurrent.current.nod, y: 0, z: 0.3 * actionCurrent.current.tilt };

                ["x", "y", "z"].forEach(axis => {
                    const diff = (target[axis] || 0) - bones.neck.rotation[axis];
                    headVelocity.current[axis] = (headVelocity.current[axis] + diff * 0.002) * 0.85;
                    bones.neck.rotation[axis] += headVelocity.current[axis];
                });
            }
        };

        const updateExpressions = (vrm, delta, time) => {
            // Blinking
            blinkState.current.timer += delta;
            if (blinkState.current.timer > 4) { blinkState.current.blinking = true; blinkState.current.timer = 0; }
            if (blinkState.current.blinking) {
                const w = Math.sin((blinkState.current.timer / 0.12) * Math.PI);
                vrm.expressionManager.setValue("blink", w);
                if (blinkState.current.timer > 0.12) { blinkState.current.blinking = false; vrm.expressionManager.setValue("blink", 0); }
            }

            // Mouth (Lipsync)
            ["aa", "oh", "ih"].forEach(v => {
                mouthCurrent.current[v] += (mouthTarget.current[v] - mouthCurrent.current[v]) * 0.25;
                vrm.expressionManager.setValue(v, mouthCurrent.current[v]);
            });

            // Emotions
            Object.keys(emotionTarget.current).forEach(e => {
                const drift = (e === "relaxed" || e === "happy") ? Math.sin(time * 0.5) * 0.02 : 0;
                emotionCurrent.current[e] += (emotionTarget.current[e] - emotionCurrent.current[e]) * 0.05;
                let val = emotionCurrent.current[e] + drift;
                if (e === "surprised") val = Math.max(val, actionCurrent.current.blush * 0.8);
                if (e === "happy") val = Math.min(val, 0.35);
                vrm.expressionManager.setValue(e, val);
            });

            vrm.expressionManager.update(delta);
            vrm.update(delta);
        };

        // --- 4. MAIN LOOP ---
        let frameId;
        const animate = () => {
            frameId = requestAnimationFrame(animate);
            const delta = 1 / 60;
            const time = performance.now() / 1000;

            if (vrmRef.current) {
                updateGaze(time, camera);
                updateBones(vrmRef.current, time);
                updateExpressions(vrmRef.current, delta, time);
            }

            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        // --- 5. CLEANUP ---
        return () => {
            cancelAnimationFrame(frameId);
            if (mountRef.current && renderer.domElement) {
                mountRef.current.removeChild(renderer.domElement);
            }
            renderer.dispose();
            scene.clear();
        };
    }, [config]);

    return { vrmRef };
}