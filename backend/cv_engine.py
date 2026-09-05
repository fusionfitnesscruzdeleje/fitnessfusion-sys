import cv2
import os
import sys
from ultralytics import YOLO
import threading
import time

def _model_path():
    if getattr(sys, 'frozen', False):
        base = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, 'yolov8n.pt')

class CVEngine:
    def __init__(self):
        self.model = None  # Loaded lazily in background
        self.cap = None
        self.is_running = False
        self.lock = threading.Lock()
        self.output_frame = None
        
        # State from frontend
        self.current_color = (128, 128, 128) # BGR: Gray by default
        self.current_status = "IDLE"
        self.current_name = ""
        self.is_alarm_active = False
        self.last_update_time = time.time()

    def set_member_status(self, name: str, status: str):
        self.current_name = name
        self.current_status = status
        self.last_update_time = time.time()
        if status == "DEUDA":
            self.current_color = (0, 0, 255) # Red
        elif status == "POR VENCER":
            self.current_color = (0, 255, 255) # Yellow
        elif status in ["AL DIA", "ACTIVO"]:
            self.current_color = (0, 255, 0) # Green
        elif status == "SIN PLAN" or status == "SIN PASES":
            self.current_color = (0, 165, 255) # Orange for Sin Plan / Sin Pases
        else:
            self.current_color = (128, 128, 128) # Gray

    def start(self):
        self.cap = cv2.VideoCapture(0)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        self.is_running = True
        # Load YOLO in background so UI opens immediately
        threading.Thread(target=self._load_model, daemon=True).start()
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()

    def _load_model(self):
        self.model = YOLO(_model_path())

    def _run_loop(self):
        frame_count = 0
        last_boxes = []
        last_person_detected = False

        while self.is_running and self.cap.isOpened():
            if time.time() - self.last_update_time > 8 and self.current_status != "IDLE":
                self.current_status = "IDLE"
                self.current_name = ""
                self.current_color = (128, 128, 128)
                self.is_alarm_active = False

            ret, frame = self.cap.read()
            if not ret:
                time.sleep(0.1)
                continue

            frame = cv2.flip(frame, 1)
            frame_count += 1

            # Run YOLO only every 5 frames and only when model is loaded
            if frame_count % 5 == 0 and self.model is not None:
                small = cv2.resize(frame, (640, 360))
                results = self.model(small, classes=[0], verbose=False)
                scale_x = frame.shape[1] / 640
                scale_y = frame.shape[0] / 360
                last_boxes = []
                last_person_detected = False
                for r in results:
                    if len(r.boxes) > 0:
                        last_person_detected = True
                    for box in r.boxes:
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                        last_boxes.append((
                            int(x1 * scale_x), int(y1 * scale_y),
                            int(x2 * scale_x), int(y2 * scale_y)
                        ))

            annotated_frame = frame.copy()
            label_text = "Persona Detectada" if self.current_status == "IDLE" else f"{self.current_name} - {self.current_status}"
            for (x1, y1, x2, y2) in last_boxes:
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), self.current_color, 3)
                cv2.putText(annotated_frame, label_text, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, self.current_color, 2)

            with self.lock:
                self.output_frame = annotated_frame
                self.is_alarm_active = last_person_detected and self.current_status == "DEUDA"

    def stop(self):
        self.is_running = False
        if self.cap:
            self.cap.release()

    def get_frame(self):
        with self.lock:
            if self.output_frame is None:
                return None
            ret, buffer = cv2.imencode('.jpg', self.output_frame)
            return buffer.tobytes() if ret else None
