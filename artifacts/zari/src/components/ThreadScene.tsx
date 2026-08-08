import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type ThreadSceneProps = {
  className?: string;
  variant?: 'hero' | 'studio';
};

export function ThreadScene({ className = '', variant = 'hero' }: ThreadSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.z = 7;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const threadMaterial = new THREE.MeshBasicMaterial({
      color: variant === 'hero' ? 0xc9858f : 0x9b7487,
      transparent: true,
      opacity: 0.82,
    });
    const pearlMaterial = new THREE.MeshBasicMaterial({
      color: variant === 'hero' ? 0xf5d9d8 : 0xe8c6cc,
      transparent: true,
      opacity: 0.88,
    });

    const points = Array.from({ length: 90 }, (_, index) => {
      const t = index / 89;
      const angle = t * Math.PI * 4.5;
      const radius = 1.08 - t * 0.72;
      return new THREE.Vector3(
        Math.cos(angle) * radius,
        (t - 0.5) * 3.2,
        Math.sin(angle) * radius * 0.42,
      );
    });
    const curve = new THREE.CatmullRomCurve3(points);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 180, 0.018, 7, false),
      threadMaterial,
    );
    group.add(tube);

    const pearlGeometry = new THREE.SphereGeometry(0.08, 12, 12);
    points.filter((_, index) => index % 12 === 0).forEach((point, index) => {
      const pearl = new THREE.Mesh(pearlGeometry, pearlMaterial);
      pearl.position.copy(point);
      pearl.scale.setScalar(index % 2 ? 0.72 : 1);
      group.add(pearl);
    });

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.45, 0.008, 6, 80),
      new THREE.MeshBasicMaterial({
        color: 0xdca8b1,
        transparent: true,
        opacity: 0.33,
      }),
    );
    halo.rotation.x = Math.PI / 2.2;
    group.add(halo);

    const resize = () => {
      const width = mount.clientWidth || 1;
      const height = mount.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    let frame = 0;
    const animate = (time: number) => {
      group.rotation.y = Math.sin(time * 0.00022) * 0.22;
      group.rotation.x = Math.cos(time * 0.00018) * 0.08;
      halo.rotation.z = time * 0.00012;
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      tube.geometry.dispose();
      threadMaterial.dispose();
      pearlGeometry.dispose();
      pearlMaterial.dispose();
      halo.geometry.dispose();
      halo.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [variant]);

  return <div className={`thread-scene thread-scene-${variant} ${className}`} ref={mountRef} aria-hidden="true" />;
}