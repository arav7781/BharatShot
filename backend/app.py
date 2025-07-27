from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import uuid
import logging
from config import logger
from graph import tool_agent

app = Flask(__name__)
CORS(app)

@app.route('/upload', methods=['POST'])
def upload_video():
    """Upload video endpoint."""
    if 'video' not in request.files:
        return jsonify({"error": "No video provided"}), 400
    
    file = request.files['video']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    upload_dir = "static/uploads"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_extension = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'mp4'
    filename = os.path.join(upload_dir, f"{uuid.uuid4()}.{file_extension}")
    
    try:
        file.save(filename)
        logger.debug(f"Video saved to {filename}")
        return jsonify({
            "video_path": filename,
            "message": "Video uploaded successfully"
        })
    except Exception as e:
        logger.error(f"Failed to save video: {str(e)}")
        return jsonify({"error": f"Failed to save video: {str(e)}"}), 500

@app.route('/chat', methods=['POST'])
def chat():
    """Chat endpoint for processing requests."""
    try:
        data = request.get_json()
        user_message = data.get('message', '')
        video_path = data.get('video_path', '')
        
        if not user_message:
            return jsonify({"error": "Message is required"}), 400
        
        if video_path and not os.path.exists(video_path):
            error_msg = f"Video file not found at {video_path}"
            logger.error(error_msg)
            return jsonify({"error": error_msg}), 400

        logger.debug(f"Processing chat request with video_path: {video_path}, message: {user_message}")
        
        # Create initial state
        initial_state = {
            "messages": [{"role": "user", "content": user_message}],
            "input_data": [],
            "current_variables": {},
            "intermediate_outputs": [],
            "output_image_paths": [],
            "output_video_path": "",
            "analysis_results": {},
            "video_path": video_path,
            "frame_data": []
        }
        
        if video_path:
            initial_state["input_data"] = [{
                "variable_name": "video",
                "data_type": "video",
                "data_path": video_path
            }]
        
        # Invoke the tool agent
        result = tool_agent.invoke(initial_state)
        
        # Prepare response with proper structure for React frontend
        response_data = {
            "message": "Processing completed",
            "intermediate_outputs": [],
            "analysis_results": {},
            "current_variables": result.get("current_variables", {}),
            "messages": [],
            "output_video": None
        }
        
        # Process messages and create intermediate outputs
        assistant_messages = []
        for msg in result.get("messages", []):
            try:
                role = msg.get('role', 'assistant')
                content = msg.get('content', str(msg))
                
                if role == "assistant":
                    assistant_messages.append({
                        "role": role,
                        "content": content
                    })
            except Exception as e:
                logger.error(f"Error processing message: {e}")
        
        # Add user message to response
        response_data["messages"].append({
            "role": "user", 
            "content": user_message
        })
        
        # Handle video analysis results
        from tools import analysis_cache
        if analysis_cache.get("output_video_path") and os.path.exists(analysis_cache["output_video_path"]):
            try:
                video_url = f"http://localhost:5001/video/{analysis_cache['output_video_path']}"
                
                # Create analysis summary
                analysis_summary = f"""
🏏 **Cricket Batting Analysis Complete!**

📊 **Analysis Results:**
- Total frames processed: {analysis_cache.get('total_frames', 0)}
- Video file size: {analysis_cache.get('video_size', 0)} bytes

🏥 **Injury Risk Assessment:**
"""
                
                if analysis_cache.get('max_injury_risk'):
                    for joint, risk in analysis_cache['max_injury_risk'].items():
                        risk_emoji = "🔴" if risk == "High" else "🟡" if risk == "Moderate" else "🟢"
                        analysis_summary += f"\n- {joint.capitalize()}: {risk_emoji} {risk} Risk"
                
                if analysis_cache.get('exercises'):
                    analysis_summary += f"\n\n💪 **Recommended Exercises:**"
                    for exercise in analysis_cache['exercises']:
                        analysis_summary += f"\n• **{exercise['exercise']}**: {exercise['description']}"
                
                # Create intermediate output
                intermediate_output = {
                    "thought": "Analyzing cricket batting video for biomechanical assessment and injury risk evaluation",
                    "code": "# Video processing with MediaPipe pose estimation\n# Analyzing batting posture, swing mechanics, and injury risk factors",
                    "output": analysis_summary,
                    "operation_type": "video_analysis"
                }
                
                response_data["intermediate_outputs"] = [intermediate_output]
                response_data["analysis_results"] = analysis_cache
                
                # Format response for React
                formatted_response = [
                    "Video analysis completed successfully",
                    {
                        "intermediate_outputs": [intermediate_output],
                        "output_video_path": analysis_cache["output_video_path"],
                        "analysis_results": analysis_cache
                    }
                ]
                
                response_data["messages"].append({
                    "role": "assistant",
                    "content": json.dumps(formatted_response),
                    "video": video_url
                })
                
                response_data["output_video"] = {
                    "path": analysis_cache["output_video_path"],
                    "url": video_url,
                    "message": "Video analysis completed with pose estimation",
                    "size": analysis_cache.get('video_size', 0)
                }
                
                logger.debug(f"Prepared video response with URL: {video_url}")
                
            except Exception as e:
                logger.error(f"Error preparing video response: {e}")
                response_data["messages"].append({
                    "role": "assistant",
                    "content": f"Analysis completed but error preparing results: {str(e)}"
                })
        else:
            if assistant_messages:
                response_data["messages"].extend(assistant_messages)
            else:
                response_data["messages"].append({
                    "role": "assistant",
                    "content": "Analysis completed but no output video was generated. Please check the video format and try again."
                })
        
        logger.debug(f"Chat response prepared successfully")
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        return jsonify({
            "error": "Internal server error",
            "details": str(e),
            "intermediate_outputs": [],
            "messages": [{"role": "assistant", "content": f"An error occurred: {str(e)}"}]
        }), 500

@app.route('/video/<path:filename>')
def serve_video(filename):
    """Serve video files with proper CORS headers."""
    try:
        if filename.startswith('static/'):
            file_path = filename
        else:
            file_path = filename
        
        if not os.path.exists(file_path):
            logger.error(f"Video file not found: {file_path}")
            return jsonify({"error": f"Video not found: {file_path}"}), 404
        
        response = send_file(file_path, mimetype='video/mp4')
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        
        logger.debug(f"Serving video file: {file_path}")
        return response
        
    except Exception as e:
        logger.error(f"Error serving video: {str(e)}")
        return jsonify({"error": f"Error serving video: {str(e)}"}), 500

@app.route('/image/<path:filename>')
def serve_image(filename):
    """Serve image files."""
    try:
        if not os.path.isabs(filename):
            filename = os.path.join(os.getcwd(), filename)
        
        if os.path.exists(filename):
            return send_file(filename, mimetype='image/png')
        else:
            logger.error(f"Image file not found: {filename}")
            return jsonify({"error": f"Image not found: {filename}"}), 404
    except Exception as e:
        logger.error(f"Error serving image: {str(e)}")
        return jsonify({"error": f"Error serving image: {str(e)}"}), 500

@app.route('/outputs')
def list_outputs():
    """List all output files."""
    try:
        outputs_dir = os.path.join("static", "outputs")
        if not os.path.exists(outputs_dir):
            return jsonify({"files": []})
        
        files = []
        for filename in os.listdir(outputs_dir):
            filepath = os.path.join(outputs_dir, filename)
            if os.path.isfile(filepath):
                files.append({
                    "name": filename,
                    "path": filepath,
                    "size": os.path.getsize(filepath),
                    "type": "video" if filename.endswith(('.mp4', '.avi')) else "image"
                })
        
        return jsonify({"files": files})
    except Exception as e:
        logger.error(f"Error listing outputs: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/debug/analysis')
def debug_analysis():
    """Debug endpoint to check analysis cache."""
    from tools import analysis_cache
    return jsonify({
        "analysis_cache": analysis_cache,
        "cache_keys": list(analysis_cache.keys()) if analysis_cache else [],
        "video_path_exists": os.path.exists(analysis_cache.get("output_video_path", "")) if analysis_cache.get("output_video_path") else False,
        "outputs_dir_contents": os.listdir("static/outputs") if os.path.exists("static/outputs") else []
    })

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "message": "Cricket Biomechanics Agent is running",
        "tools_available": [
            "video_pose_estimation_tool",
            "advanced_image_processor"
        ]
    })

@app.route('/capabilities', methods=['GET'])
def get_capabilities():
    """Get capabilities endpoint."""
    return jsonify({
        "video_processing": [
            "Pose estimation",
            "Injury risk assessment",
            "Swing speed calculation",
            "Exercise recommendations"
        ],
        "image_processing": [
            "Grayscale conversion",
            "Blur and sharpening",
            "Edge detection",
            "Morphological operations"
        ]
    })

if __name__ == '__main__':
    os.makedirs("static/uploads", exist_ok=True)
    os.makedirs("static/outputs", exist_ok=True)
    
    logger.info("🚀 Cricket Biomechanics Agent starting...")
    app.run(debug=True, port=5001, host='0.0.0.0')