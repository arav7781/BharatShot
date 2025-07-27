
import logging
import os
import mediapipe as mp
from langchain.chat_models import init_chat_model

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

os.environ["GROQ_API_KEY"] = "your_groq_api_key"




mp_pose = mp.solutions.pose
pose = mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.5, min_tracking_confidence=0.5)
mp_drawing = mp.solutions.drawing_utils


llm = init_chat_model("groq:llama3-8b-8192")


persistent_vars = {}
analysis_cache = {}