import { ChatOpenAI } from "@langchain/openai";
const apiKey = process.env.DASHSCOPE_API_KEY || 'sk-47e69fdbb4c740da83656a0ee12b1ea3'
console.log('API Key:', apiKey ? '已设置' : '未设置')
// 创建聊天模型实例
const chatModel = new ChatOpenAI({
    model: "qwen-plus",
    apiKey: apiKey, // 建议使用环境变量
    configuration: {
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    }
});

// 异步函数来测试聊天模型
async function testChatModel(input: string) {
    try {
        console.log("正在调用聊天模型...");
        const response = await chatModel.invoke(input);
        console.log("响应内容:", response.content);
    } catch (error) {
        console.error("调用聊天模型时出错:", error);
    }
}

async function runAllTests() {
    await testChatModel("你好，我叫张昊，我是一名程序员");
    await testChatModel("你好，请告诉我叫什么名字，我的职业是？");
}

runAllTests();