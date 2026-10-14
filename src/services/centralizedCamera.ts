/**
 * Centralized Device Camera Service
 *
 * Manages device camera lifecycle, hardware stream arbitration,
 * available device enumeration (webcams, USB scanners, front/back cameras),
 * torch control, and graceful cleanup across the entire application.
 */

class CentralizedCameraService {
  private activeStream: MediaStream | null = null;
  private currentDeviceId: string | null = null;
  private currentFacingMode: 'environment' | 'user' = 'environment';
  private torchActive = false;

  /**
   * Retrieves all available video input devices on the system
   */
  public async getAvailableVideoDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'videoinput');
    } catch (err) {
      console.warn('Failed to enumerate video devices:', err);
      return [];
    }
  }

  /**
   * Starts a centralized camera stream with fallback strategies
   */
  public async startStream(options: {
    deviceId?: string;
    facingMode?: 'environment' | 'user';
  } = {}): Promise<MediaStream> {
    // Stop any existing stream globally before acquiring a new one
    this.stopCurrentStream();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera access is not supported by your browser or environment.');
    }

    const mode = options.facingMode || this.currentFacingMode || 'environment';
    const deviceId = options.deviceId || this.currentDeviceId;

    let stream: MediaStream;

    try {
      if (deviceId) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceId }
          },
          audio: false
        });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode }
          },
          audio: false
        });
      }
    } catch (err1) {
      console.warn('Initial camera constraints failed, attempting fallback:', err1);
      try {
        if (deviceId) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: deviceId } },
            audio: false
          });
        } else {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: mode },
            audio: false
          });
        }
      } catch (err2) {
        try {
          // Fallback: Generic video track without any facing mode constraints
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        } catch (err3: any) {
          throw new Error(err3?.message || 'Unable to access device camera.');
        }
      }
    }

    this.activeStream = stream;
    this.currentFacingMode = mode;
    if (deviceId) {
      this.currentDeviceId = deviceId;
    }
    this.torchActive = false;

    return stream;
  }

  /**
   * Safely releases and stops all tracks of the active camera stream
   */
  public stopCurrentStream(): void {
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.activeStream = null;
    }
    this.torchActive = false;
  }

  /**
   * Returns the currently active global MediaStream, if any
   */
  public getActiveStream(): MediaStream | null {
    return this.activeStream;
  }

  /**
   * Checks if flashlight/torch is supported on current active camera track
   */
  public isTorchSupported(): boolean {
    if (!this.activeStream) return false;
    const track = this.activeStream.getVideoTracks()[0];
    if (!track) return false;
    try {
      const capabilities: any = track.getCapabilities ? track.getCapabilities() : {};
      return !!capabilities.torch;
    } catch {
      return false;
    }
  }

  /**
   * Toggles the hardware flashlight/torch
   */
  public async toggleTorch(): Promise<boolean> {
    if (!this.activeStream) return false;
    const track = this.activeStream.getVideoTracks()[0];
    if (!track) return false;

    try {
      const capabilities: any = track.getCapabilities ? track.getCapabilities() : {};
      if (!capabilities.torch) {
        return false;
      }

      this.torchActive = !this.torchActive;
      await track.applyConstraints({
        advanced: [{ torch: this.torchActive } as any]
      });
      return this.torchActive;
    } catch (err) {
      console.warn('Failed to toggle torch:', err);
      return false;
    }
  }

  public isTorchActive(): boolean {
    return this.torchActive;
  }
}

export const centralizedCamera = new CentralizedCameraService();
