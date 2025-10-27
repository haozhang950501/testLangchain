import { createAgent } from "langchain";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

// 创建聊天模型实例
const chatModel = new ChatOpenAI({
    model: "qwen-plus",
    apiKey: process.env.DASHSCOPE_API_KEY || 'sk-47e69fdbb4c740da83656a0ee12b1ea3',
    configuration: {
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    }
});

// 创建记忆存储实例
const checkpointer = new MemorySaver();

// 创建带记忆的智能体
const agent = createAgent({
    model: chatModel,
    tools: [],
    checkpointer
});

// 多轮对话测试函数
async function testMultiTurnConversation() {
    const threadId = "test-session-1";
    
    try {
        console.log("=== 开始多轮对话记忆测试 ===\n");
        
        // 第一轮：自我介绍
        console.log("第1轮对话:");
        console.log("用户: 你好，我叫张三，我是一名程序员");
        const response1 = await agent.invoke(
            { messages: [{ role: "user", content: "你好，我叫张三，我是一名程序员" }] },
            { configurable: { thread_id: threadId } }
        );
        console.log("AI:", response1.messages[response1.messages.length - 1].content);
        console.log("---\n");
        
        // 第二轮：测试名字记忆
        console.log("第2轮对话:");
        console.log("用户: 你还记得我的名字吗？");
        const response2 = await agent.invoke(
            { messages: [{ role: "user", content: "你还记得我的名字吗？" }] },
            { configurable: { thread_id: threadId } }
        );
        console.log("AI:", response2.messages[response2.messages.length - 1].content);
        console.log("---\n");
        
        // 第三轮：添加更多信息
        console.log("第3轮对话:");
        console.log("用户: 我喜欢吃苹果，住在北京");
        const response3 = await agent.invoke(
            { messages: [{ role: "user", content: "我喜欢吃苹果，住在北京" }] },
            { configurable: { thread_id: threadId } }
        );
        console.log("AI:", response3.messages[response3.messages.length - 1].content);
        console.log("---\n");
        
        // 第四轮：测试综合记忆
        console.log("第4轮对话:");
        console.log("用户: 你能总结一下关于我的信息吗？");
        const response4 = await agent.invoke(
            { messages: [{ role: "user", content: "你能总结一下关于我的信息吗？" }] },
            { configurable: { thread_id: threadId } }
        );
        console.log("AI:", response4.messages[response4.messages.length - 1].content);
        console.log("---\n");
        
        // 第五轮：测试职业记忆
        console.log("第5轮对话:");
        console.log("用户: 我的职业是什么？");
        const response5 = await agent.invoke(
            { messages: [{ role: "user", content: "我的职业是什么？" }] },
            { configurable: { thread_id: threadId } }
        );
        console.log("AI:", response5.messages[response5.messages.length - 1].content);
        console.log("---\n");
        
        // 第六轮：测试位置记忆
        console.log("第6轮对话:");
        console.log("用户: 我住在哪里？");
        const response6 = await agent.invoke(
            { messages: [{ role: "user", content: "我住在哪里？" }] },
            { configurable: { thread_id: threadId } }
        );
        console.log("AI:", response6.messages[response6.messages.length - 1].content);
        console.log("---\n");
        
        // 显示对话历史统计
        console.log("=== 对话历史统计 ===");
        console.log(`总对话轮数: ${response6.messages.length}`);
        console.log("记忆功能测试完成！");
        
    } catch (error) {
        console.error("对话过程中出错:", error);
    }
}

// 测试不同会话的记忆隔离
async function testMemoryIsolation() {
    console.log("\n=== 测试记忆隔离功能 ===\n");
    
    try {
        // 会话1：张三的信息
        console.log("会话1 - 张三:");
        const session1 = await agent.invoke(
            { messages: [{ role: "user", content: "我叫张三，是工程师" }] },
            { configurable: { thread_id: "session-zhang" } }
        );
        console.log("AI:", session1.messages[session1.messages.length - 1].content);
        
        // 会话2：李四的信息
        console.log("\n会话2 - 李四:");
        const session2 = await agent.invoke(
            { messages: [{ role: "user", content: "我叫李四，是医生" }] },
            { configurable: { thread_id: "session-li" } }
        );
        console.log("AI:", session2.messages[session2.messages.length - 1].content);
        
        // 回到会话1，测试记忆隔离
        console.log("\n回到会话1，询问张三的职业:");
        const session1Check = await agent.invoke(
            { messages: [{ role: "user", content: "我的职业是什么？" }] },
            { configurable: { thread_id: "session-zhang" } }
        );
        console.log("AI:", session1Check.messages[session1Check.messages.length - 1].content);
        
        // 回到会话2，测试记忆隔离
        console.log("\n回到会话2，询问李四的职业:");
        const session2Check = await agent.invoke(
            { messages: [{ role: "user", content: "我的职业是什么？" }] },
            { configurable: { thread_id: "session-li" } }
        );
        console.log("AI:", session2Check.messages[session2Check.messages.length - 1].content);
        
    } catch (error) {
        console.error("记忆隔离测试出错:", error);
    }
}

// 执行测试
async function runAllTests() {
    await testMultiTurnConversation();
    await testMemoryIsolation();
}

runAllTests();