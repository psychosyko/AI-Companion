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

    useEffect(() => {
        if (!config || !mountRef.current) return;

        const isMobile = window.innerWidth < 768;
        const scene = new THREE.Scene();

        // --- 1. DYNAMIC CAMERA SETTINGS ---
        // Lower FOV (25) acts like a zoom lens to keep her face prominent
        const camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 1000);

        if (isMobile) {
            // Drop camera very low (waist level) and back it up (5.5)
            camera.position.set(0, 0.4, 4.5);
        } else {
            // Desk level camera
            camera.position.set(0, 0.7, 3.2);
        }

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        mountRef.current.innerHTML = '';
        mountRef.current.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);

        // --- 2. TARGET ADJUSTMENT (The "Push Up" Logic) ---
        // By looking at a point high ABOVE her head (2.4 on mobile), 
        // her body is physically pulled to the top edge of the viewport.
        controls.target.set(0, isMobile ? 1 : 1.5, 0);
        controls.enableDamping = true;

        const sun = new THREE.DirectionalLight(0xddddff, 1.2);
        sun.position.set(1, 2, 1);
        scene.add(sun, new THREE.AmbientLight(0x443366, 1.5));

        const loader = new GLTFLoader();
        loader.register(parser => new VRMLoaderPlugin(parser));

        const vrmPath = config.vrm.startsWith('/') ? `.${config.vrm}` : config.vrm;

        loader.load(vrmPath, gltf => {
            const vrm = gltf.userData.vrm;
            vrmRef.current = vrm;
            scene.add(vrm.scene);
            vrm.scene.rotation.y = Math.PI;
            vrm.lookAt.target = camera;
            vrm.update(0);
            console.log("Nazuna successfully loaded.");
        },
        undefined,
        (error) => console.error("VRM Loader Error:", error));

        // --- 3. RESIZE HANDLER (Crucial for Mobile) ---
        const handleResize = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            const nowMobile = width < 768;

            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);

            // Update framing dynamically on rotation or resize
            controls.target.set(0, nowMobile ? 2.4 : 1.8, 0);
            if (nowMobile) {
                camera.position.set(0, 0.4, 5.5);
            } else {
                camera.position.set(0, 0.7, 3.2);
            }
        };
        window.addEventListener('resize', handleResize);

        function animate() {
            const requestID = requestAnimationFrame(animate);
            const delta = 1 / 60;
            const time = performance.now() / 1000;
            const vrm = vrmRef.current;

            if (vrm) {
                const leftArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
                const rightArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
                const spine = vrm.humanoid.getNormalizedBoneNode("spine");

                if (leftArm && rightArm) {
                    const sway = Math.sin(time * 0.8) * 0.05;
                    leftArm.rotation.z = 1.2 + sway;
                    rightArm.rotation.z = -1.2 - sway;
                }
                if (spine) {
                    spine.rotation.x = Math.sin(time * 1.5) * 0.04;
                    spine.rotation.y = Math.sin(time * 0.6) * 0.05;
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
                if (e === "happy") val = Math.min(val, 0.35);
                vrm.expressionManager.setValue(e, val);
            });

            vrm.expressionManager.update(delta);
            vrm.update(delta);
        }

        animate();

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationID);
            renderer.dispose();
            if (mountRef.current) mountRef.current.innerHTML = "";
        };
    }, [config]);

    return { vrmRef, mouthTarget, emotionTarget };
}