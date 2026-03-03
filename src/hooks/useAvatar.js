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
    
    // Actions
    const actionTarget = useRef({ lean: 0, blush: 0, nod: 0, tilt: 0 });
    const actionCurrent = useRef({ lean: 0, blush: 0, nod: 0, tilt: 0 });

    useEffect(() => {
        if (!config || !mountRef.current) return;

        const isMobile = window.innerWidth < 768;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        // Framing
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
        const vrmPath = config.vrm.startsWith('/') ? `.${config.vrm}` : config.vrm;

        loader.load(vrmPath, gltf => {
            const vrm = gltf.userData.vrm;
            vrmRef.current = vrm;
            vrm.scene.rotation.y = Math.PI;
            vrm.lookAt.target = camera;
            scene.add(vrm.scene);
        }, undefined, (err) => console.error("VRM Load Error:", err));

        let animationID;
        function animate() {
            animationID = requestAnimationFrame(animate);
            const delta = 1 / 60;
            const time = performance.now() / 1000;
            const vrm = vrmRef.current;

            if (vrm) {
                // Get bone nodes safely
                const spine = vrm.humanoid.getNormalizedBoneNode("spine");
                const neck = vrm.humanoid.getNormalizedBoneNode("neck");
                const leftArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
                const rightArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");

                // 1. Smoothly interpolate action values
                Object.keys(actionTarget.current).forEach(key => {
                    actionCurrent.current[key] += (actionTarget.current[key] - actionCurrent.current[key]) * 0.05;
                });

                // 2. Apply Bone Rotations
                if (spine) {
                    const breathing = Math.sin(time * 1.5) * 0.04;
                    const leanAmount = actionCurrent.current.lean * 0.25;
                    spine.rotation.x = breathing + leanAmount;
                }

                if (neck) {
                    const nodEffect = Math.sin(time * 10) * 0.1 * actionCurrent.current.nod;
                    const tiltEffect = 0.3 * actionCurrent.current.tilt;
                    neck.rotation.x = nodEffect;
                    neck.rotation.z = tiltEffect;
                }

                if (leftArm && rightArm) {
                    const sway = Math.sin(time * 0.8) * 0.05;
                    leftArm.rotation.z = 1.2 + sway;
                    rightArm.rotation.z = -1.2 - sway;
                }

                updateExpressions(vrm, delta);
            }
            
            controls.update();
            renderer.render(scene, camera);
        }

        function updateExpressions(vrm, delta) {
            // Blinking
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

            // Lip Sync
            ["aa", "oh", "ih"].forEach(v => {
                mouthCurrent.current[v] += (mouthTarget.current[v] - mouthCurrent.current[v]) * 0.25;
                vrm.expressionManager.setValue(v, mouthCurrent.current[v]);
            });

            // Emotions & Blush
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