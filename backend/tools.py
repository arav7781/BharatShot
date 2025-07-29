
import cv2
import numpy as np
import mediapipe as mp
from math import degrees
import os
import uuid
from PIL import Image
from io import StringIO
import sys
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from langchain_core.tools import tool
from config import logger, mp_pose, pose, mp_drawing, persistent_vars, analysis_cache

# angle calculation using 3 landmarks jo zyda use hore h frame mai 
def calculate_angle(p1, p2, p3):
    """Calculate angle between three points (in degrees)."""
    try:
        a = np.array(p1)
        b = np.array(p2)
        c = np.array(p3)
        ab = a - b
        bc = c - b
        dot_product = np.dot(ab, bc)
        magnitude_ab = np.linalg.norm(ab)
        magnitude_bc = np.linalg.norm(bc)
        
        if magnitude_ab == 0 or magnitude_bc == 0:
            return 0
            
        cos_angle = dot_product / (magnitude_ab * magnitude_bc)
        cos_angle = np.clip(cos_angle, -1.0, 1.0)
        return degrees(np.arccos(cos_angle))
    except Exception as e:
        logger.error(f"Error calculating angle: {e}")
        return 0

def assess_injury_risk(landmarks, frame_rate, bat_positions):
    """Assess injury risk based on pose landmarks and swing speed."""
    injury_risk = {"back": "Low", "knees": "Low", "shoulders": "Low"}
    analysis = {}
    
    try:
        left_shoulder = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER]
        right_shoulder = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER]
        left_hip = landmarks[mp_pose.PoseLandmark.LEFT_HIP]
        right_hip = landmarks[mp_pose.PoseLandmark.RIGHT_HIP]
        left_knee = landmarks[mp_pose.PoseLandmark.LEFT_KNEE]
        right_knee = landmarks[mp_pose.PoseLandmark.RIGHT_KNEE]
        spine_mid = [(left_hip.x + right_hip.x) / 2, (left_hip.y + right_hip.y) / 2]
        
        spine_angle = calculate_angle(
            [left_shoulder.x, left_shoulder.y],
            spine_mid,
            [left_hip.x, left_hip.y]
        )
        if spine_angle > 30:
            injury_risk["back"] = "High"
            analysis["back"] = "Excessive forward lean detected, increasing spinal strain."
        elif spine_angle > 20:
            injury_risk["back"] = "Moderate"
            analysis["back"] = "Moderate forward lean; monitor posture."
        else:
            analysis["back"] = "Good spinal alignment."
        
        left_knee_angle = calculate_angle(
            [left_hip.x, left_hip.y],
            [left_knee.x, left_knee.y],
            [landmarks[mp_pose.PoseLandmark.LEFT_ANKLE].x, landmarks[mp_pose.PoseLandmark.LEFT_ANKLE].y]
        )
        if left_knee_angle < 120:
            injury_risk["knees"] = "High"
            analysis["knees"] = "Excessive knee bend detected, potential for strain."
        elif left_knee_angle < 140:
            injury_risk["knees"] = "Moderate"
            analysis["knees"] = "Moderate knee bend; consider strengthening exercises."
        else: 
            analysis["knees"] = "Good knee alignment."
        
        shoulder_angle = calculate_angle(
            [left_hip.x, left_hip.y],
            [left_shoulder.x, left_shoulder.y],
            [landmarks[mp_pose.PoseLandmark.LEFT_ELBOW].x, landmarks[mp_pose.PoseLandmark.LEFT_ELBOW].y]
        )
        if shoulder_angle > 90:
            injury_risk["shoulders"] = "High"
            analysis["shoulders"] = "Excessive shoulder rotation detected, risk of strain."
        elif shoulder_angle > 70:
            injury_risk["shoulders"] = "Moderate"
            analysis["shoulders"] = "Moderate shoulder rotation; ensure proper warm-up."
        else:
            analysis["shoulders"] = "Good shoulder alignment."
        
        swing_speed = 0
        if len(bat_positions) >= 2:
            dist = np.linalg.norm(np.array(bat_positions[-1]) - np.array(bat_positions[-2]))
            swing_speed = dist * frame_rate
            analysis["swing_speed"] = f"Swing speed: {swing_speed:.2f} units/second"
            if swing_speed > 50:
                injury_risk["shoulders"] = max(injury_risk["shoulders"], "High")
                analysis["shoulders"] += " High swing speed increases shoulder strain."
    
    except Exception as e:
        logger.error(f"Error in injury risk assessment: {e}")
        analysis["error"] = f"Error in analysis: {str(e)}"
    
    return injury_risk, analysis

def suggest_exercises(injury_risk):
    """Suggest personalized exercises based on injury risk."""
    exercises = []
    if injury_risk["back"] in ["Moderate", "High"]:
        exercises.append({
            "exercise": "Cat-Cow Stretch",
            "description": "Improves spinal flexibility and reduces back strain. Perform 10 reps, holding each position for 5 seconds."
        })
    if injury_risk["knees"] in ["Moderate", "High"]:
        exercises.append({
            "exercise": "Quadriceps Stretch",
            "description": "Strengthens knee support muscles. Hold for 30 seconds per leg, 3 reps."
        })
    if injury_risk["shoulders"] in ["Moderate", "High"]:
        exercises.append({
            "exercise": "Shoulder Blade Squeeze",
            "description": "Improves shoulder stability. Perform 15 reps, holding for 5 seconds."
        })
    if not exercises:
        exercises.append({
            "exercise": "General Warm-Up",
            "description": "Perform light cardio and dynamic stretches for 5-10 minutes to prepare muscles."
        })
    return exercises

@tool
def video_pose_estimation_tool(video_path: str, operation_type: str = "pose_estimation") -> str:
    """Process video for pose estimation and biomechanical analysis."""
    logger.debug(f"Processing video at path: {video_path}")
    try:
        if not os.path.exists(video_path):
            error_msg = f"Error: Video not found at {video_path}"
            logger.error(error_msg)
            return error_msg
        
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            error_msg = f"Error: Could not open video at {video_path}"
            logger.error(error_msg)
            return error_msg
        
        frame_rate = cap.get(cv2.CAP_PROP_FPS)
        frame_data = []
        output_frames = []
        bat_positions = []
        frame_count = 0
        
        while cap.isOpened() and frame_count < 100:
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose.process(frame_rgb)
            
            frame_annotated = frame.copy()
            injury_risk = {"back": "Low", "knees": "Low", "shoulders": "Low"}
            analysis = {"frame": frame_count, "status": "No pose detected"}
            
            if results.pose_landmarks:
                mp_drawing.draw_landmarks(
                    frame_annotated,
                    results.pose_landmarks,  
                    mp_pose.POSE_CONNECTIONS,
                    mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2),
                    mp_drawing.DrawingSpec(color=(0, 0, 255), thickness=2)
                )
                
                landmarks = results.pose_landmarks.landmark
                injury_risk, analysis = assess_injury_risk(landmarks, frame_rate, bat_positions)
                
                right_wrist = landmarks[mp_pose.PoseLandmark.RIGHT_WRIST]
                bat_positions.append([right_wrist.x * frame.shape[1], right_wrist.y * frame.shape[0]])
                
                y_offset = 30
                for joint, risk in injury_risk.items():
                    color = (0, 0, 255) if risk == "High" else (255, 165, 0) if risk == "Moderate" else (0, 255, 0)
                    cv2.putText(
                        frame_annotated,
                        f"{joint.capitalize()}: {risk}",
                        (10, y_offset),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        color,
                        2
                    )
                    y_offset += 30
                
                cv2.putText(
                    frame_annotated,
                    f"Frame: {frame_count}",
                    (10, frame.shape[0] - 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (255, 255, 255),
                    2
                )
            
            output_frames.append(frame_annotated)
            frame_data.append({
                "frame": frame_count,
                "injury_risk": injury_risk,
                "analysis": analysis
            })
            frame_count += 1
            
            if frame_count % 10 == 0:
                logger.debug(f"Processed {frame_count} frames")
        
        cap.release()
        logger.debug(f"Video processing completed. Total frames: {frame_count}")
        
        if output_frames:
            output_video_path = os.path.join("static", "outputs", f"annotated_{uuid.uuid4()}.mp4")
            os.makedirs(os.path.dirname(output_video_path), exist_ok=True)
            
            height, width = output_frames[0].shape[:2]
            fourcc = cv2.VideoWriter_fourcc(*'H264')
            try:
                out = cv2.VideoWriter(output_video_path, fourcc, max(frame_rate, 10.0), (width, height))
                if not out.isOpened():
                    fourcc = cv2.VideoWriter_fourcc(*'XVID')
                    output_video_path = output_video_path.replace('.mp4', '.avi')
                    out = cv2.VideoWriter(output_video_path, fourcc, max(frame_rate, 10.0), (width, height))
            except:
                fourcc = cv2.VideoWriter_fourcc(*'MJPG')
                output_video_path = output_video_path.replace('.mp4', '.avi')
                out = cv2.VideoWriter(output_video_path, fourcc, max(frame_rate, 10.0), (width, height))
            
            if out.isOpened():
                for frame in output_frames:
                    out.write(frame)
                out.release()
                logger.debug(f"Video saved successfully: {output_video_path}")
            else:
                logger.error("Failed to create video writer")
                return "Error: Could not create output video file"
            
            max_risk = {"back": "Low", "knees": "Low", "shoulders": "Low"}
            for frame in frame_data:
                for joint, risk in frame["injury_risk"].items():
                    risk_levels = {"Low": 0, "Moderate": 1, "High": 2}
                    if risk_levels.get(risk, 0) > risk_levels.get(max_risk[joint], 0):
                        max_risk[joint] = risk
            
            exercises = suggest_exercises(max_risk)
            
            analysis_cache.update({
                "output_video_path": output_video_path,
                "frame_data": frame_data,
                "exercises": exercises,
                "max_injury_risk": max_risk,
                "total_frames": frame_count,
                "video_exists": os.path.exists(output_video_path),
                "video_size": os.path.getsize(output_video_path) if os.path.exists(output_video_path) else 0
            })
            
            logger.debug(f"Analysis cache updated: {analysis_cache}")
            
            result = f"""
Video analysis completed successfully!

Processed {frame_count} frames with {frame_rate:.1f} FPS.

Overall Injury Risk Assessment:
- Back: {max_risk['back']}
- Knees: {max_risk['knees']}
- Shoulders: {max_risk['shoulders']}

Recommended Exercises:
{chr(10).join([f"• {ex['exercise']}: {ex['description']}" for ex in exercises])}

Annotated video saved at: {output_video_path}
Video file exists: {os.path.exists(output_video_path)}
Video file size: {os.path.getsize(output_video_path) if os.path.exists(output_video_path) else 0} bytes
"""
            
            logger.debug(f"Video processing successful. Output video: {output_video_path}")
            return result
        else:
            return "Error: No frames could be processed from the video."
    
    except Exception as e:
        logger.error(f"Video processing error: {str(e)}")
        return f"Error processing video: {str(e)}"

@tool
def advanced_image_processor(thought: str, python_code: str, image_path: str, operation_type: str = "general") -> str:
    """Advanced image processing tool with OpenCV, PIL, and matplotlib support."""
    logger.debug(f"Processing image at path: {image_path}")
    
    if not os.path.exists(image_path):
        error_msg = f"Error: Image not found at {image_path}"
        logger.error(error_msg)
        return error_msg
    
    try:
        current_variables = {
            "image": cv2.imread(image_path),
            "pil_image": Image.open(image_path),
            "image_path": image_path
        }
        
        if current_variables["image"] is None:
            error_msg = f"Error: Could not load image from {image_path}"
            logger.error(error_msg)
            return error_msg
        
        old_stdout = sys.stdout
        sys.stdout = StringIO()
        
        exec_globals = globals().copy()
        exec_globals.update(persistent_vars)
        exec_globals.update(current_variables)
        exec_globals.update({
            "cv2": cv2,
            "np": np,
            "plt": plt,
            "patches": patches,
            "Image": Image,
            "ImageDraw": ImageDraw,
            "ImageFont": ImageFont,
            "output_images": [],
            "analysis_data": {},
            "detection_results": []
        })
        
        exec(python_code, exec_globals)
        
        output = sys.stdout.getvalue()
        sys.stdout = old_stdout
        
        persistent_vars.update({k: v for k, v in exec_globals.items() 
                               if k not in globals() and not k.startswith('__')})
        
        if "output_images" in exec_globals and exec_globals["output_images"]:
            saved_images = []
            for i, img in enumerate(exec_globals["output_images"]):
                image_filename = os.path.join("static", "outputs", f"processed_{uuid.uuid4()}.png")
                os.makedirs(os.path.dirname(image_filename), exist_ok=True)
                
                if isinstance(img, np.ndarray):
                    cv2.imwrite(image_filename, img)
                    saved_images.append(image_filename)
                elif isinstance(img, Image.Image):
                    img.save(image_filename)
                    saved_images.append(image_filename)
            
            persistent_vars["saved_image_paths"] = saved_images
            output += f"\nSaved {len(saved_images)} processed images."
        
        result = f"Image processing completed.\nThought: {thought}\nOutput: {output or 'Operation completed successfully'}"
        logger.debug(f"Image processing successful")
        return result
    
    except Exception as e:
        sys.stdout = old_stdout
        error_msg = f"Error: {str(e)}"
        logger.error(error_msg)
        return f"Image processing failed.\nThought: {thought}\nError: {error_msg}"
