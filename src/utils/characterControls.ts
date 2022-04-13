import { Ray, RigidBody, World } from '@dimforge/rapier3d';
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { A, D, DIRECTIONS, S, W } from './keydisplay'

export const CONTROLLER_BODY_RADIUS = 0.28;

export class CharacterControls {

    model: THREE.Group
    mixer: THREE.AnimationMixer
    animationsMap: Map<string, THREE.AnimationAction> = new Map() // Walk, Run, Idle
    orbitControl: OrbitControls
    camera: THREE.Camera

    // state
    toggleRun: boolean = true
    currentAction: string
    
    // temporary data
    walkDirection = new THREE.Vector3()
    rotateAngle = new THREE.Vector3(0, 1, 0)
    rotateQuarternion: THREE.Quaternion = new THREE.Quaternion()
    cameraTarget = new THREE.Vector3()
    storedFall = 0
    
    // constants
    fadeDuration: number = 0.2
    runVelocity = 5
    walkVelocity = 2

    ray: Ray
    rigidBody: RigidBody
    lerp = (x: number, y: number, a: number) => x * (1 - a) + y * a;

    constructor(model: THREE.Group,
        mixer: THREE.AnimationMixer, animationsMap: Map<string, THREE.AnimationAction>,
        orbitControl: OrbitControls, camera: THREE.Camera,
        currentAction: string,
        ray: Ray, rigidBody: RigidBody) {
        this.model = model
        this.mixer = mixer
        this.animationsMap = animationsMap
        this.currentAction = currentAction
        this.animationsMap.forEach((value, key) => {
            if (key == currentAction) {
                value.play()
            }
        })
        
        this.ray = ray
        this.rigidBody = rigidBody

        this.orbitControl = orbitControl
        this.camera = camera
        this.updateCameraTarget(new THREE.Vector3(0,1,5))
    }

    public switchRunToggle() {
        this.toggleRun = !this.toggleRun
    }

    public update(world: World, delta: number, keysPressed: any) {
        const directionPressed = DIRECTIONS.some(key => keysPressed[key] == true)

        var play = '';
        if (directionPressed && this.toggleRun) {
            play = 'Run'
        } else if (directionPressed) {
            play = 'Walk'
        } else {
            play = 'Idle'
        }

        if (this.currentAction != play) {
            const toPlay = this.animationsMap.get(play)
            const current = this.animationsMap.get(this.currentAction)

            current.fadeOut(this.fadeDuration)
            toPlay.reset().fadeIn(this.fadeDuration).play();

            this.currentAction = play
        }

        this.mixer.update(delta)

        this.walkDirection.x = this.walkDirection.y = this.walkDirection.z = 0

        let velocity = 0
        if (this.currentAction == 'Run' || this.currentAction == 'Walk') {
            // calculate towards camera direction
            var angleYCameraDirection = Math.atan2(
                    (this.camera.position.x - this.model.position.x), 
                    (this.camera.position.z - this.model.position.z))
            // diagonal movement angle offset
            var directionOffset = this.directionOffset(keysPressed)

            // rotate model
            this.rotateQuarternion.setFromAxisAngle(this.rotateAngle, angleYCameraDirection + directionOffset)
            this.model.quaternion.rotateTowards(this.rotateQuarternion, 0.2)

            // calculate direction
            this.camera.getWorldDirection(this.walkDirection)
            this.walkDirection.y = 0
            this.walkDirection.normalize()
            this.walkDirection.applyAxisAngle(this.rotateAngle, directionOffset)

            // run/walk velocity
            velocity = this.currentAction == 'Run' ? this.runVelocity : this.walkVelocity
        }

        const translation = this.rigidBody.translation();
        if (translation.y < -1) {
            // don't fall below ground
            this.rigidBody.setNextKinematicTranslation( { 
                x: 0, 
                y: 10, 
                z: 0 
            });
        } else {
            const cameraPositionOffset = this.camera.position.sub(this.model.position);
            // update model and camera
            this.model.position.x = translation.x
            this.model.position.y = translation.y
            this.model.position.z = translation.z
            this.updateCameraTarget(cameraPositionOffset)
    
            this.walkDirection.y += this.lerp(this.storedFall, -9.81 * delta, 0.10)
            this.storedFall = this.walkDirection.y
            this.ray.origin.x = translation.x
            this.ray.origin.y = translation.y
            this.ray.origin.z = translation.z
            let hit = world.castRay(this.ray, 0.5, false, 0xfffffffff);
            if (hit) {
                const point = this.ray.pointAt(hit.toi);
                let diff = translation.y - ( point.y + CONTROLLER_BODY_RADIUS);
                if (diff < 0.0) {
                    this.storedFall = 0
                    this.walkDirection.y = this.lerp(0, Math.abs(diff), 0.5)
                }
            }
    
            this.walkDirection.x = this.walkDirection.x * velocity * delta
            this.walkDirection.z = this.walkDirection.z * velocity * delta

            this.rigidBody.setNextKinematicTranslation( { 
                x: translation.x + this.walkDirection.x, 
                y: translation.y + this.walkDirection.y, 
                z: translation.z + this.walkDirection.z 
            });
        }
    }

    private updateCameraTarget(offset: THREE.Vector3) {
        // move camera
        const rigidTranslation = this.rigidBody.translation();
        this.camera.position.x = rigidTranslation.x + offset.x
        this.camera.position.y = rigidTranslation.y + offset.y
        this.camera.position.z = rigidTranslation.z + offset.z

        // update camera target
        this.cameraTarget.x = rigidTranslation.x
        this.cameraTarget.y = rigidTranslation.y + 1
        this.cameraTarget.z = rigidTranslation.z
        this.orbitControl.target = this.cameraTarget
    }

    private directionOffset(keysPressed: any) {
        var directionOffset = 0 // w

        if (keysPressed[W]) {
            if (keysPressed[A]) {
                directionOffset = Math.PI / 4 // w+a
            } else if (keysPressed[D]) {
                directionOffset = - Math.PI / 4 // w+d
            }
        } else if (keysPressed[S]) {
            if (keysPressed[A]) {
                directionOffset = Math.PI / 4 + Math.PI / 2 // s+a
            } else if (keysPressed[D]) {
                directionOffset = -Math.PI / 4 - Math.PI / 2 // s+d
            } else {
                directionOffset = Math.PI // s
            }
        } else if (keysPressed[A]) {
            directionOffset = Math.PI / 2 // a
        } else if (keysPressed[D]) {
            directionOffset = - Math.PI / 2 // d
        }

        return directionOffset
    }

}