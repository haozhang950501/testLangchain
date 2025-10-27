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
const AIMessagestructure = z.object({
    content: z.string().describe("AI的回答内容")
});
// 工具1: 检查AX code 环境
const checkAXEnvironmentTool = tool(
    async (version:string,config: LangGraphRunnableConfig) => {
        try {                    
            const { stdout, stderr } = await execAsync("apax --version");
            if (stderr) {
                const result = `❌ apax检查失败: ${stderr}`;
                config.writer?.(result);
                return result;
            }
            const result = `✅ apax环境正常: ${stdout.trim()}`;
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
            const currentDir = process.cwd();
            const result = `📁 当前工作目录: ${currentDir}`;           
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
            config.writer?.(`📝 正在创建AX app项目: ${projectName.toLowerCase()} 在目录: ${currentWorkspaceDir}`);
            const { stdout, stderr } = await execAsync(`apax create app ${projectName.toLowerCase()}`,{ cwd: currentWorkspaceDir });
            if (stderr) {
                return `❌ 创建AX app项目失败: ${stderr}`;
            }
            return `✅ AX app项目已成功创建: ${stdout}`;
        } catch (error) {
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
            config.writer?.(`📝 正在进入项目路径: ${projectName.toLowerCase()} 在目录: ${currentWorkspaceDir}`);
            const { stdout, stderr } = await execAsync(`cd ${projectName.toLowerCase()}`,{ cwd: currentWorkspaceDir });
            const projectPath = path.join(process.cwd(), projectName.toLowerCase());
            return `✅ 已进入项目路径: ${projectPath}`;
        } catch (error) {
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

/*// 工具6: 写入ST代码
const writePythonScriptTool = tool(
    async ({ scriptContent, filename  }: { scriptContent: string; filename?: string }, config: LangGraphRunnableConfig) => {
        try {
            config.writer?.(`📝 正在编辑并写入Python脚本: ${filename}`);
            const filePath = path.join(process.cwd(), filename || 'script.py');
            fs.writeFileSync(filePath, scriptContent, 'utf8');
            return `✅ Python脚本已成功写入: ${filePath}`;
        } catch (error) {
            return `❌ 写入Python脚本失败: ${error}`;
        }
    },
    {
        name: "write_python_script",
        description: "将Python代码写入到指定文件中",
        schema: z.object({
            scriptContent: z.string().describe("要写入的Python脚本内容"),
            filename: z.string().optional().describe("文件名，默认为script.py")
        })
    }
);*/

// 工具7: 编译ST代码
const compileSTCodeTool = tool(
    async ({ projectPath }: { projectPath: string }, config: LangGraphRunnableConfig) => {
        try {
            config.writer?.(`🚀 正在编译ST代码`);
            const { stdout, stderr } = await execAsync(`apax build`,{ cwd: projectPath });
            
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


const agent = createReactAgent({
    llm: chatModel,
    tools: [
        checkAXEnvironmentTool, 
        getCurrentDirTool, 
        createAXAppProjectTool,
        enterProjectPathTool,
        installAXSDKPackageTool,
        compileSTCodeTool,
        listWorkspaceFilesTool,
        readProjectMetadataTool
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
                content: `你是一个西门子SIMATIC AX 工程师，具有以下特点：

**重要：你必须严格按照以下顺序执行，不能跳过任何步骤！**

1. **思维链推理**: 你必须逐步思考和分析每个问题，展示你的推理过程
2. **强制环境检查**: 每次执行任务前，你必须先检查AX code 环境
3. **按照顺序执行**: 按照以下标准流程执行任务(可选表示可以不用执行)：
   - **第一步(必须)**: 检查AX code 环境,确保apax 包管理器已经安装
   - **第二步(可选)**: 获取当前工作目录
   - **第三步(可选)**: 根据用户的需求创建模板项目
   - **第四步(可选)**: 根据用户的需求安装AX Code所需SDK包（必须传递正确的项目路径参数）
   - **第五步(可选)**: 根据用户的需求在当前项目路径下执行编译（必须传递正确的项目路径参数）

**重要提示**: 在执行安装和编译任务时，必须传递完整的项目路径参数，格式为：{ "projectPath": "完整路径/项目名称" }

4. **错误处理**: 如果遇到问题，要分析原因并提供解决方案
5. **明确停止**: 当任务完成时，明确说明任务已完成

**记住：第一步永远是检查AX code 环境环境，不要跳过！**`
            },
            {
                role: "user",
                content: `帮我创建一个AX的app项目，项目名称为"Myfirst_AX"`
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
