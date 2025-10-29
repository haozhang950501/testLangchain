import { createAgent } from "langchain";
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
    }
});

const checkpointer = new MemorySaver();

// 工具1: 检查Python环境
const checkPythonEnvironmentTool = tool(
    async (version:string,config: LangGraphRunnableConfig) => {
        try {           
              
            const { stdout, stderr } = await execAsync("python --version");
            if (stderr) {
                const result = `❌ Python检查失败: ${stderr}`;
                config.writer?.(result);
                return result;
            }
            const result = `✅ Python环境正常: ${stdout.trim()}`;
            config?.writer?.(result);
            return result;
        } catch (error) {
            try {
                config.writer?.("尝试使用python3...");
                // 尝试python3
                const { stdout } = await execAsync("python3 --version");
                const result = `✅ Python3环境正常: ${stdout.trim()}`;
                config.writer?.(result);
                return result;
            } catch (error2) {
                const result = `❌ 未找到Python环境: ${error}`;
                config.writer?.(result);
                return result;
            }
        }
    },
    {
        name: "check_python_environment",
        description: "检查系统中是否安装了Python环境，返回Python版本信息",
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

// 工具3: 写入Python脚本文件
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
);

// 工具4: 执行Python脚本
const executePythonScriptTool = tool(
    async ({ filename }: { filename?: string }, config: LangGraphRunnableConfig) => {
        try {
            config.writer?.(`🚀 正在执行Python脚本: ${filename}`);
            const filePath = path.join(process.cwd(), filename || 'script.py');
            
            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                return `❌ 文件不存在: ${filePath}`;
            }
            
            const { stdout, stderr } = await execAsync(`python "${filePath}"`);
            
            if (stderr) {
                return `⚠️ 执行完成，但有警告:\n输出: ${stdout}\n警告: ${stderr}`;
            }
            
            return `✅ 脚本执行成功:\n${stdout}`;
        } catch (error) {
            try {
                // 尝试使用python3
                const filePath = path.join(process.cwd(), filename || 'script.py');
                const { stdout, stderr } = await execAsync(`python3 "${filePath}"`);
                
                if (stderr) {
                    return `⚠️ 执行完成，但有警告:\n输出: ${stdout}\n警告: ${stderr}`;
                }
                
                return `✅ 脚本执行成功:\n${stdout}`;
            } catch (error2) {
                return `❌ 执行Python脚本失败: ${error}`;
            }
        }
    },
    {
        name: "execute_python_script",
        description: "执行指定的Python脚本文件",
        schema: z.object({
            filename: z.string().optional().describe("要执行的Python文件名，默认为script.py")
        })
    }
);

// 工具5: 列出当前目录的文件
const listFilesTool = tool(
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

// 工具6: 读取Python脚本文件内容
const readPythonScriptTool = tool(
    async ({ filename  }: { filename?: string }, config: LangGraphRunnableConfig) => {
        try {
            config.writer?.(`📖 正在读取检查Python脚本: ${filename}`);
            const filePath = path.join(process.cwd(), filename || 'script.py');
            
            if (!fs.existsSync(filePath)) {
                return `❌ 文件不存在: ${filePath}`;
            }
            
            const content = fs.readFileSync(filePath, 'utf8');
            return `📖 文件内容 (${filename}):\n\`\`\`python\n${content}\n\`\`\``;
        } catch (error) {
            return `❌ 读取文件失败: ${error}`;
        }
    },
    {
        name: "read_python_script",
        description: "读取指定Python脚本文件的内容",
        schema: z.object({
            filename: z.string().optional().describe("要读取的Python文件名，默认为script.py")
        })
    }
);

// 工具7: 使用pip安装Python包
const installPythonPackageTool = tool(
    async ({ packageName, version }: { packageName: string; version?: string }, config: LangGraphRunnableConfig) => {
        try {
            config.writer?.(`📦 正在安装Python包: ${packageName}${version ? `==${version}` : ''}`);
            
            const packageSpec = version ? `${packageName}==${version}` : packageName;
            const { stdout, stderr } = await execAsync(`pip install "${packageSpec}"`);
            
            if (stderr && !stderr.includes('Successfully installed')) {
                // 尝试使用pip3
                try {
                    const { stdout: stdout3, stderr: stderr3 } = await execAsync(`pip3 install "${packageSpec}"`);
                    if (stderr3 && !stderr3.includes('Successfully installed')) {
                        return `⚠️ 安装完成，但有警告:\n输出: ${stdout3}\n警告: ${stderr3}`;
                    }
                    return `✅ 包安装成功 (使用pip3):\n${stdout3}`;
                } catch (error3) {
                    return `❌ 使用pip3安装失败: ${error3}`;
                }
            }
            
            return `✅ 包安装成功:\n${stdout}`;
        } catch (error) {
            try {
                // 尝试使用pip3
                const packageSpec = version ? `${packageName}==${version}` : packageName;
                const { stdout, stderr } = await execAsync(`pip3 install "${packageSpec}"`);
                
                if (stderr && !stderr.includes('Successfully installed')) {
                    return `⚠️ 安装完成，但有警告:\n输出: ${stdout}\n警告: ${stderr}`;
                }
                
                return `✅ 包安装成功 (使用pip3):\n${stdout}`;
            } catch (error2) {
                return `❌ 安装Python包失败: ${error}`;
            }
        }
    },
    {
        name: "install_python_package",
        description: "使用pip安装指定的Python包",
        schema: z.object({
            packageName: z.string().describe("要安装的Python包名称"),
            version: z.string().optional().describe("包的版本号，可选")
        })
    }
);

// 工具8: 打开HTML文件
const openHtmlFileTool = tool(
    async ({ filename }: { filename?: string }, config: LangGraphRunnableConfig) => {
        try {
            config.writer?.(`🌐 正在打开HTML文件: ${filename}`);
            
            const filePath = path.join(process.cwd(), filename || 'output.html');
            
            if (!fs.existsSync(filePath)) {
                return `❌ HTML文件不存在: ${filePath}`;
            }
            
            // 使用更可靠的方式打开HTML文件
            const platform = process.platform;
            let command: string;
            
            if (platform === 'win32') {
                // Windows: 使用默认浏览器打开
                command = `powershell -Command "Start-Process '${filePath}'"`;
            } else if (platform === 'darwin') {
                // macOS: 使用open命令
                command = `open "${filePath}"`;
            } else {
                // Linux: 使用xdg-open
                command = `xdg-open "${filePath}"`;
            }
            
            try {
                await execAsync(command);
                return `✅ HTML文件已成功在浏览器中打开: ${filePath}`;
            } catch (execError) {
                // 如果PowerShell失败，尝试使用start命令
                if (platform === 'win32') {
                    try {
                        await execAsync(`start "${filePath}"`);
                        return `✅ HTML文件已成功在浏览器中打开: ${filePath}`;
                    } catch (startError) {
                        return `⚠️ 无法自动打开HTML文件，请手动打开: ${filePath}`;
                    }
                }
                return `⚠️ 无法自动打开HTML文件，请手动打开: ${filePath}`;
            }
        } catch (error) {
            return `❌ 打开HTML文件失败: ${error}`;
        }
    },
    {
        name: "open_html_file",
        description: "在默认浏览器中打开指定的HTML文件",
        schema: z.object({
            filename: z.string().optional().describe("要打开的HTML文件名，默认为output.html")
        })
    }
);



const agent = createReactAgent({
    llm: chatModel,
    tools: [
        checkPythonEnvironmentTool, 
        getCurrentDirTool, 
        writePythonScriptTool, 
        executePythonScriptTool,
        listFilesTool,
        readPythonScriptTool,
        installPythonPackageTool,
        openHtmlFileTool
    ],
    checkpointer
}) as any;

// 测试函数
async function testPythonAgent() {
    try {
        console.log("=== 测试Python Agent (思维链 + 强制环境检查) ===");
        
        const messages = [
            {
                role: "system",
                content: `你是一个专业的Python数据分析助手，具有以下特点：

**重要：你必须严格按照以下顺序执行，不能跳过任何步骤！**

1. **思维链推理**: 你必须逐步思考和分析每个问题，展示你的推理过程
2. **强制环境检查**: 每次执行任务前，你必须先检查Python环境
3. **严格顺序执行**: 按照以下标准流程执行数据分析任务，**绝对不能改变顺序**：
   - **第一步**: 检查Python环境
   - **第二步**: 获取当前工作目录
   - **第三步**: 安装你写的脚本所需的必要的包
   - **第四步**: 创建数据分析脚本
   - **第五步**: 执行脚本生成结果
   - **第六步(可选)**: 使用openHtmlFileTool打开HTML文件展示结果

4. **错误处理**: 如果遇到问题，要分析原因并提供解决方案
5. **明确停止**: 当任务完成时，明确说明任务已完成

**记住：第一步永远是检查Python环境，不要跳过！**`
            },
            {
                role: "user",
                content: `帮我创建一个简单的中国大学生就业情况数据分析脚本,要求：
                1.获取最新的数据，并保存到CSV文件中
                2.使用pandas读取CSV文件并进行基本的数据分析
                3.再生成html的数据图表,最后帮我打开这个html文件用于展示结果`
            }
        ];
      
        console.log("开始流式处理...\n");
        
        for await (const chunk of await agent.stream(
            { messages: messages },
            { 
                configurable: {
                    thread_id: "python-analysis-thread2"
                },
                streamMode: "custom",
                recursionLimit: 50
            }       
        )) {
            console.log(chunk);
            console.log("\n");
        }
        
        console.log("\n=== 流式处理完成 ===");
        
    } catch (error) {
        console.error("测试出错:", error);
    }
}

testPythonAgent();
