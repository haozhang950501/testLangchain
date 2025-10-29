import { createAgent, toolStrategy } from "langchain";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

const execAsync = promisify(exec);

const chatModel = new ChatOpenAI({
    model: "qwen3-max",
    apiKey: process.env.DASHSCOPE_API_KEY || 'sk-47e69fdbb4c740da83656a0ee12b1ea3',
    configuration: {
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    },
    verbose: false
});

const checkpointer = new MemorySaver();

// 工具1: 检查AX code 环境
const checkAXEnvironmentTool = tool(
    async (version:string,config: LangGraphRunnableConfig) => {
        try {                    
            console.log("调用了AX环境检查工具...");
            const { stdout, stderr } = await execAsync("apax --version");
            if (stderr) {
                const result = `❌ apax检查失败: ${stderr}`;
                config.writer?.(result);
                return result;
            }
            const result = `✅ apax环境正常: ${stdout.trim()}`;
            console.log("AX环境检查工具返回结果:", result);
            config?.writer?.(result);
            return result;
        } catch (error) {
            try {
                config.writer?.("尝试升级apax包管理器...");
                // 尝试python3
                const { stdout } = await execAsync("apax self-update");
                const result = `✅ apax环境正常: ${stdout.trim()}`;
                config.writer?.(result);
                return result;
            } catch (error2) {
                const result = `❌ 未找到apax环境: ${error}`;
                config.writer?.(result);
                return result;
            }
        }
    },
    {
        name: "check_apax_environment",
        description: "检查系统中是否安装了AX环境，返回apax包管理器版本信息",
        schema: z.object({})
    }
);

// 工具2: 获取当前工作目录
const getCurrentDirTool = tool(
    async (currentDir:string,config: LangGraphRunnableConfig) => {
        try {
            console.log("调用了获取当前工作目录工具...");
            const currentDir = process.cwd();
            const result = `📁 当前工作目录: ${currentDir}`;   
            console.log("获取当前工作目录工具返回结果:", result);
            config.writer?.(result);
            return result;
        } catch (error) {
            const result = `❌ 获取目录失败: ${error}`;
            config.writer?.(result);
            return result;
        }
    },
    {
        name: "get_current_directory",
        description: "获取当前工作目录路径",
        schema: z.object({})
    }
);
//工具3：创建AX app项目
const createAXAppProjectTool = tool(    async ({ projectName,currentWorkspaceDir }: { projectName: string,currentWorkspaceDir: string }, config: LangGraphRunnableConfig) => {
        try {
            console.log("调用了创建AX app项目工具...");
            config.writer?.(`📝 正在创建AX app项目: ${projectName.toLowerCase()} 在目录: ${currentWorkspaceDir}`);
            const { stdout, stderr } = await execAsync(`apax create app ${projectName.toLowerCase()}`,{ cwd: currentWorkspaceDir });
            if (stderr) {
                return `❌ 创建AX app项目失败: ${stderr}`;
            }
            console.log("创建AX app项目工具返回结果:"+ `${stdout}`);
            return `✅ AX app项目已成功创建: ${stdout}`;
        } catch (error) {
            console.log("创建AX app项目工具返回错误:"+ `${error}`);
            return `❌ 创建AX app项目失败: ${error}`;
        }
    },
    {
        name: "create_ax_app_project",
        description: "创建AX app项目",
        schema: z.object({
            projectName: z.string().describe("要创建的AX app项目名称"),
            currentWorkspaceDir: z.string().describe("当前工作区目录")
        })
    }
);

//工具4：进入项目路径
const enterProjectPathTool = tool(    async ({ projectName,currentWorkspaceDir }: { projectName: string,currentWorkspaceDir: string }, config: LangGraphRunnableConfig) => {
        try {
            console.log("调用了进入项目路径工具...");
            config.writer?.(`📝 正在进入项目路径: ${projectName.toLowerCase()} 在目录: ${currentWorkspaceDir}`);
            const { stdout, stderr } = await execAsync(`cd ${projectName.toLowerCase()}`,{ cwd: currentWorkspaceDir });
            const projectPath = path.join(process.cwd(), projectName.toLowerCase());
            console.log("进入项目路径工具返回结果:"+ `${projectPath}`);
            return `✅ 已进入项目路径: ${projectPath}`;
        } catch (error) {
            console.log("进入项目路径工具返回错误:"+ `${error}`);
            return `❌ 进入项目路径失败: ${error}`;
        }
    },
    {
        name: "enter_project_path",
        description: "进入项目路径",
        schema: z.object({
            projectName: z.string().describe("要进入的AX app项目名称"),
            currentWorkspaceDir: z.string().describe("当前工作目录")
        })
    }
);
// 工具5: 使用apax install 安装ax code SDK包
const installAXSDKPackageTool = tool(
    async ({ projectPath }: { projectPath: string }, config: LangGraphRunnableConfig) => {
        try {
            console.log("调用了安装AX code SDK包工具...");
            config.writer?.(`📦 正在安装AX code SDK包: ${projectPath}`);
            
            // 确保项目路径存在
            if (!fs.existsSync(projectPath)) {
                return `❌ 项目路径不存在: ${projectPath}`;
            }
            
            // 使用 exec 的 cwd 选项在指定目录下执行命令
            const { stdout, stderr } = await execAsync(`apax install`, { 
                cwd: projectPath 
            });
             
            if (stderr) {
                return `⚠️ 安装完成，但有警告:\n输出: ${stdout}\n警告: ${stderr}`;
            }
            console.log("安装AX code SDK包工具返回结果:"+ `${stdout}`);
            return `✅ AX code SDK包安装成功:\n${stdout}`;
        } catch (error) {
            return `❌ AX code SDK包安装失败: ${error}`;
        }
    },
    {
        name: "install_ax_code_sdk_package",
        description: "使用apax install 安装AX code SDK包",
        schema: z.object({
            projectPath: z.string().describe("要安装的AX code SDK包所在项目路径")
        })
    }
);


// 工具7: 编译ST代码
const compileSTCodeTool = tool(
    async ({ projectPath }: { projectPath: string }, config: LangGraphRunnableConfig) => {
        try {
            console.log("调用了编译ST代码工具...");
            config.writer?.(`🚀 正在编译ST代码`);
            const { stdout, stderr } = await execAsync(`apax build`,{ cwd: projectPath });
            console.log("编译ST代码工具返回结果:"+ `${stdout}`);
            if (stderr) {
                return `⚠️ 执行完成，但有警告:\n输出: ${stdout}\n警告: ${stderr}`;
            }
            
            return `✅ 编译ST代码成功:\n${stdout}`;
        } catch (error) {
            return `❌ 编译ST代码失败: ${error}`;
        }
    },
    {
        name: "compile_st_code",
        description: "编译ST代码",
        schema: z.object({
            projectPath: z.string().describe("要编译的ST代码所在项目路径")
        })
    }
);

// 工具8: 列出当前工作区目录的文件
const listWorkspaceFilesTool = tool(
    async (config: LangGraphRunnableConfig) => {
        try {
            config.writer?.("📋 列出当前目录文件...");
            const files = fs.readdirSync(process.cwd());
            const fileList = files.map(file => {
                const filePath = path.join(process.cwd(), file);
                const stats = fs.statSync(filePath);
                return `${file} (${stats.isDirectory() ? '目录' : '文件'})`;
            }).join('\n');
            
            return `📋 当前目录文件列表:\n${fileList}`;
        } catch (error) {
            return `❌ 列出文件失败: ${error}`;
        }
    },
    {
        name: "list_files",
        description: "列出当前目录中的所有文件和文件夹",
        schema: z.object({})
    }
);

// 工具9: 读取项目元数据清单文件apax.yml文件内容
const readProjectMetadataTool = tool(
    async ({ projectPath }: { projectPath: string }, config: LangGraphRunnableConfig) => {
        try {
            config.writer?.("📖 正在读取项目元数据清单文件apax.yml...");
            const filePath = path.join(projectPath, 'apax.yml');
            const content = fs.readFileSync(filePath, 'utf8');
            return `📖 项目元数据清单文件apax.yml内容:\n${content}`;
        } catch (error) {
            return `❌ 读取项目元数据清单文件apax.yml失败: ${error}`;
        }
    },
    {
        name: "read_project_metadata",
        description: "读取项目元数据清单文件apax.yml内容",
        schema: z.object({
            projectPath: z.string().describe("要读取的项目路径")
        })
    }
);
//构建子Agent1,用于管理AX项目
const subagent1=createReactAgent({
    llm: chatModel,
    tools: [
        checkAXEnvironmentTool,
        getCurrentDirTool,
        createAXAppProjectTool
    ],
    checkpointer,
});
//构建子Agent1作为工具调用
const callAXSubagent1= tool(
 async ({query}:{query:string})=>{
    const result= await subagent1.invoke({messages: [{role: "user", content: query}]});
    return result.messages.at(-1)?.content;
 },
 {
    name: "AX_Project_Agent",
    description: "调用AX项目子智能体,用于检查AX环境/获取当前工作区域/创建AX项目/",
    schema: z.object({
        query: z.string().describe("调用AX_Project_Agent子智能体的查询")
    })
 }
)
//构建子Agent2,用于编译项目
const subagent2=createReactAgent({
    llm: chatModel,
    tools: [
        enterProjectPathTool,
        installAXSDKPackageTool,
        compileSTCodeTool
    ],
    checkpointer,
});

const callAXSubagent2= tool(
    async ({query}:{query:string})=>{
        const result= await subagent2.invoke({messages: [{role: "user", content: query}]});
        return result.messages.at(-1)?.content;
    },
    {
        name: "AX_Build_Agent",
        description: "调用AX项目构建子智能体,用于进入项目路径/安装AX Code所需SDK包/编译ST代码/",
        schema: z.object({
            query: z.string().describe("调用AX_Build_Agent子智能体的查询")
        })
    }
);


const agent = createReactAgent({
    llm: chatModel,
    tools: [
       callAXSubagent1,
       callAXSubagent2,
    ],
    checkpointer,

}) as any;

// 测试函数
async function testPythonAgent() {
    try {
        console.log("=== 测试Python Agent (思维链 + 强制环境检查) ===");
        
        const messages = [
            {
                role: "system",
                content: ` 你是一个西门子SIMATIC AX 工程师助手，具有以下特点：
 **核心能力**:
 - 帮助用户进行SIMATIC AX开发
 - 提供AX环境管理检查
 - 协助项目创建和代码编译
 - 解答AX相关技术问题

 **工作流程**:
 当用户需要有关AX项目操作时,你可以:
 1. **环境检查**:检查AX code环境(如果需要)
 2. **获取当前工作目录**:获取当前工作目录(如果需要)
 3. **项目操作**:创建AX项目(如果需要)
 当用户需要安装AX sdk包操作时,你可以:
 1.**进入AX项目路径**:进入用户创建的AX项目路径(必须)
 2. **安装AX sdk包**:协助安装AX sdk包(如果需要)
 3. **代码编译**:协助编译ST代码(如果需要)


 **重要原则**:
 - 只有在用户明确需要对AX项目进行操作时才使用工具
 - 对于一般性问题和对话，直接回答，不要调用工具
 - 工具调用应该基于用户的具体需求，而不是强制性的
 - 优先进行对话交流，工具调用是辅助手段

**子智能体使用场景**:
- 用户询问AX环境状态时 → 使用 AX_Project_Agent,
- 用户需要创建AX项目时 → 使用 AX_Project_Agent,
- 用户需要安装AX SKD/依赖/包时 → 使用 AX_Build_Agent
- 用户需要编译ST代码时 → 使用 AX_Build_Agent

**记住**:工具是为了帮助用户完成具体任务，而不是每次对话都必须使用。`
            },
            {
                role: "user",
                // content: `帮我创建一个AX的app项目,项目名称为"test_AX,按照所需的SDK,并且编译ST代码"`
                content: `帮我检查ax环境`
            }
        ];
      
        console.log("开始流式处理...\n");
        
        let stepCounter = 0;
        
        for await (const chunk of await agent.stream(
            { messages: messages },
            { 
                configurable: {
                    thread_id: "AX_thread_1"
                },
                streamMode: "updates",
                recursionLimit: 50
            }       
        )) {
            stepCounter++;
            console.log(`\n🔄 === 步骤 ${stepCounter} ===`);
            
            // 处理 agent 消息
            if (chunk.agent && chunk.agent.messages) {
                const message = chunk.agent.messages[0];
                console.log(`🤖 AI 回答: ${message.content}`);
                
                // 显示工具调用
                if (message.tool_calls && message.tool_calls.length > 0) {
                    console.log(`🔧 AI工具调用:`);
                    message.tool_calls.forEach((toolCall: any, index: number) => {
                        console.log(`  工具 ${index + 1}: ${toolCall.name}`);
                        console.log(`  参数: ${JSON.stringify(toolCall.args, null, 2)}`);
                    });
                }
                
                // 显示 token 使用情况
                if (message.usage_metadata) {
                    console.log(`📊 Token 使用: 输入 ${message.usage_metadata.input_tokens}, 输出 ${message.usage_metadata.output_tokens}, 总计 ${message.usage_metadata.total_tokens}`);
                }
            }
            
            // 处理工具执行结果
            if (chunk.tools && chunk.tools.messages) {
                const toolMessage = chunk.tools.messages[0];
                console.log(`📊 工具执行结果:`);
                console.log(`  工具: ${toolMessage.name}`);
                console.log(`  结果: ${toolMessage.content}`);
            }
            
            console.log("─".repeat(60));
        }
        
        console.log("\n=== 流式处理完成 ===");
        
        // 显示最终状态摘要
        console.log("\n📋 === 执行摘要 ===");
        const finalState = await agent.getState({
            configurable: {
                thread_id: "AX_thread_1"
            }
        });
        
        console.log(`总步骤数: ${stepCounter}`);
        console.log(`消息数量: ${finalState.values.messages?.length || 0}`);
        
        // 统计工具调用
        const toolCalls = finalState.values.messages?.filter((msg: any) => msg.tool_calls && msg.tool_calls.length > 0) || [];
        console.log(`工具调用次数: ${toolCalls.length}`);
        
        // 统计 token 使用
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        finalState.values.messages?.forEach((msg: any) => {
            if (msg.usage_metadata) {
                totalInputTokens += msg.usage_metadata.input_tokens || 0;
                totalOutputTokens += msg.usage_metadata.output_tokens || 0;
            }
        });
        console.log(`总 Token 使用: 输入 ${totalInputTokens}, 输出 ${totalOutputTokens}, 总计 ${totalInputTokens + totalOutputTokens}`);
        
    } catch (error) {
        console.error("测试出错:", error);
    }
}

testPythonAgent();
