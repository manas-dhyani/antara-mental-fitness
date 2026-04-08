from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from config import settings

class LLMService:
    def __init__(self):
        self.model = ChatGroq(
            temperature=0.7, 
            groq_api_key=settings.GROQ_API_KEY, 
            model_name="llama-3.3-70b-versatile"
        )
        self.parser = StrOutputParser()

    def get_chat_chain(self, journal_context: str = ""):
        # We use 'input' to match your chat.py dictionary key
        # We use 'chat_history' to match your history list
        system_prompt = f"""
        You are Antara, an empathetic AI wellness companion. 
        Use the following context from the user's past journals to provide personalized support:
        {journal_context if journal_context else "No specific past context found."}
        
        Guidelines: Be supportive, concise, and non-judgmental.
        """
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}")
        ])
        
        return prompt | self.model | self.parser
    
    # Change 'input_text' to 'user_input' to match what your route is sending
    async def get_response(self, user_input: str, chat_history: list = [], journal_context: str = ""):
        """
        Helper method to generate a response directly.
        """
        chain = self.get_chat_chain(journal_context)
        response = await chain.ainvoke({
            "input": user_input,  # This maps 'user_input' to the {input} in your prompt template
            "chat_history": chat_history
        })
        return response
            

llm_service = LLMService()  