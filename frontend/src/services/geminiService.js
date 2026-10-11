// import api from '../utils/api';

// /**
//  * Single AI Evaluation Function
//  */
// export const evaluateWithAI = async (text, instructions = "") => {
//   try {
//     if (!text) {
//       throw new Error("No text provided for evaluation");
//     }

//     // Sending both text and custom instructions
//     const response = await api.post('/evaluation/evaluate', { 
//         text, 
//         teacherInstructions: instructions 
//     });
    
//     return response.data;
//   } catch (error) {
//     console.error("Gemini Service Error:", error.response?.data || error.message);
//     throw error;
//   }
// };

// /**
//  * Bulk evaluation function
//  */
// export const evaluateWithAiBulk = async (data) => {
//   try {
//     // data should contain { submissionIds, teacherInstructions }
//     const response = await api.post('/evaluation/evaluate', data);
//     return response.data;
//   } catch (error) {
//     console.error("Gemini Bulk Service Error:", error.response?.data || error.message);
//     throw error;
//   }
// };

// const geminiService = {
//   evaluateWithAI,
//   evaluateWithAiBulk
// };

// export default geminiService
