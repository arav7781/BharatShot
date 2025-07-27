from typing import Annotated, List, Dict
from typing_extensions import TypedDict
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
import json
from config import llm, logger
from tools import video_pose_estimation_tool, advanced_image_processor

class State(TypedDict):
    messages: Annotated[list[dict], add_messages]
    input_data: list[dict]
    current_variables: dict
    intermediate_outputs: list[dict]
    output_image_paths: list[str]
    output_video_path: str
    analysis_results: dict
    video_path: str
    frame_data: List[Dict]

def make_tool_graph():
    """Create and configure the LangGraph for tool execution."""
    tools = [video_pose_estimation_tool, advanced_image_processor]
    tool_node = ToolNode(tools)
    llm_with_tools = llm.bind_tools(tools)

    def call_llm_model(state: State):
        """Call the LLM with tools."""
        system_prompt = """
You are an expert biomechanics AI assistant specializing in cricket batting analysis.
You have access to tools for:
1. video_pose_estimation_tool: Processes videos for pose estimation and biomechanical analysis
2. advanced_image_processor: Executes custom OpenCV/PIL code for image processing

For video analysis:
- Use video_pose_estimation_tool for batting posture analysis
- Analyze injury risk (back, knees, shoulders) and calculate swing speed
- Provide personalized exercise recommendations

Always:
1. Use the video_path from the user's message or state
2. Explain your approach in the response
3. Handle errors gracefully
4. Provide detailed biomechanical analysis and exercise suggestions
"""
        try:
            messages = state["messages"]
            
            if not any(msg.get('role') == 'system' for msg in messages):
                messages = [{"role": "system", "content": system_prompt}] + messages
            
            if state.get("video_path"):
                last_human_msg = None
                for i, msg in enumerate(messages):
                    if msg.get('role') == 'user':
                        last_human_msg = i
                
                if last_human_msg is not None and "video_path" not in messages[last_human_msg]['content']:
                    messages[last_human_msg]['content'] += f"\nVideo path: {state['video_path']}"
            
            response = llm_with_tools.invoke(messages)
            return {"messages": [{"role": "assistant", "content": response.content}], "video_path": state.get("video_path", "")}
            
        except Exception as e:
            logger.error(f"LLM call error: {e}")
            error_response = {"role": "assistant", "content": f"I encountered an error while processing your request: {str(e)}. Please try again with a different approach."}
            return {
                "messages": [error_response],
                "video_path": state.get("video_path", "")
            }

    builder = StateGraph(State)
    builder.add_node("tool_calling_llm", call_llm_model)
    builder.add_node("tools", tool_node)
    builder.add_edge(START, "tool_calling_llm")
    builder.add_conditional_edges("tool_calling_llm", tools_condition)
    builder.add_edge("tools", "tool_calling_llm")
    
    return builder.compile()

tool_agent = make_tool_graph()