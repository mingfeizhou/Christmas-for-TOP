
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export class MediaPipeService {
  private handLandmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;

  async init(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );

    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 1
    });

    await this.startCamera();
  }

  private async startCamera() {
    if (!this.video) return;
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 160, height: 120 } 
    });
    this.video.srcObject = stream;
    await this.video.play();
  }

  detectGestures(callback: (results: any) => void) {
    if (!this.handLandmarker || !this.video || this.video.readyState < 2) return;

    const results = this.handLandmarker.detectForVideo(this.video, performance.now());
    if (results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];
      
      // Calculate gesture
      const wrist = landmarks[0];
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      
      const fingerTips = [landmarks[12], landmarks[16], landmarks[20]];
      
      // Pinch: thumb and index
      const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y, thumbTip.z - indexTip.z);
      
      // Fist vs Open Hand: Average distance from fingertips to wrist
      const avgDist = fingerTips.reduce((acc, tip) => acc + Math.hypot(tip.x - wrist.x, tip.y - wrist.y), 0) / 3;

      let gesture = "NONE";
      if (pinchDist < 0.05) {
        gesture = "PINCH";
      } else if (avgDist < 0.25) {
        gesture = "FIST";
      } else if (avgDist > 0.4) {
        gesture = "OPEN";
      }

      callback({
        gesture,
        center: landmarks[9], // Middle finger MCP as center
      });
    } else {
      callback(null);
    }
  }
}

export const mediaPipeService = new MediaPipeService();
