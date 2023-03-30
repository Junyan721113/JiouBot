"use strict";
import { createClient, core } from "oicq";
import fs from "fs";
import https from "https";
import asyncTask from "async";
import childp from "child_process";
import { Configuration, OpenAIApi } from "openai";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeMathjax from "rehype-mathjax";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import puppeteer from "puppeteer";

const account = fs.readFileSync("User.txt").toString();
const client = createClient(account, { platform: 3 });

const HELPTEXT =
	"JiouBot v1.3.1 Debug\n" +
	"要触发我，请at我或在消息中加入'jiou'关键词\n" +
	"支持好友私聊\n" +
	"5分钟内连续发送超过10条消息自动忽略\n" +
	"用户群 631371483\n" +
	"help 显示此文字\n" +
	"ffxiv 关键词 查询FF14猫区市场价\n" +
	"chat 内容 和Chat???聊一句";

//const RESO = require("./reso.json");
//const PLANT = RESO.plant;
//const SHOP = RESO.shop;

client
	.on("system.login.qrcode", function (e) {
		console.log("扫码完成后请按回车");
		process.stdin.once("data", () => {
			this.login();
		});
	})
	.login();

client.on("system.login.slider", function (e) {
	console.log("输入ticket：");
	process.stdin.once("data", (ticket) => this.submitSlider(String(ticket).trim()));
});

client.on("system.online", () => console.log("系统已登入，当前时间" + Date.now()));

client.on("request.friend", (e) => {
	e.approve(true);
});

client.on("request.group.invite", (e) => {
	e.approve(true);
});

let userTiming = new Map();

let compUser = (a, b) => {
	return b.Money - a.Money;
};

//流式资源传输----------------------------------------------------------------

let getFileRaw = (filePath) => {
	return new Promise((resolve, reject) => {
		console.log("尝试获取文件内容 " + filePath);
		let buf = "";
		let readerStream = fs.createReadStream(filePath, { flags: "r", encoding: "utf-8" });
		readerStream.setEncoding("UTF8");
		readerStream.on("open", () => {
			console.log("打开文件成功");
		});
		readerStream.on("data", (chunk) => {
			buf += chunk;
		});
		readerStream.on("end", () => {
			resolve(buf);
		});
		readerStream.on("error", (err) => {
			console.log(err.stack);
			reject(err);
		});
		readerStream.on("close", () => {
			resolve(buf);
		});
	});
};

let getURLBuffer = (reqURL) => {
	console.log("正在请求资源 " + reqURL);
	return new Promise((resolve, reject) => {
		let buf = "";
		let packetCnt = 0;
		let req = https.get(reqURL, (res) => {
			console.log("statusCode:", res.statusCode);
			//console.log("headers:", res.headers);
			res.on("data", (d) => {
				//process.stdout.write(d);
				console.log("从目标URL处GET到" + ++packetCnt + "个数据包");
				buf += d;
			});
			res.on("close", () => {
				resolve(buf);
			});
			res.on("end", () => {
				resolve(buf);
			});
			res.on("error", (e) => {
				console.error(e);
				reject(e);
			});
		});
		req.on("error", (e) => {
			console.error(e);
			reject(e);
		});
	});
};

let reqOptBuffer = (opt, data) => {
	console.log("正在请求资源 " + opt.hostname + opt.path);
	return new Promise((resolve, reject) => {
		let buf = "";
		let req = https.request(opt, (res) => {
			console.log("statusCode:", res.statusCode);
			//console.log("headers:", res.headers);
			res.setEncoding("utf8");
			res.on("data", (d) => {
				//process.stdout.write(d);
				console.log("从目标URL处POST到一个数据包: " + d);
				buf += d;
			});
			res.on("end", () => {
				resolve(buf);
			});
			res.on("error", (e) => {
				console.error(e);
				reject(e);
			});
		});
		req.on("error", (e) => {
			console.error(e);
			reject(e);
		});
		req.write(data);
		req.end();
	});
};

//OpenAI官方API----------------------------------------------------------------

const configuration = new Configuration({
	apiKey: "Bearer " + "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",
});
const openai = new OpenAIApi(configuration);

async function callChatGPT(pmt) {
	try {
		const completion = await openai.createCompletion({
			model: "text-davinci-003",
			prompt: pmt,
		});
		return completion.data.choices[0].text;
	} catch (error) {
		if (error.response) console.error(error.response.status, error.response.data);
		else console.error(`Error with OpenAI API request: ${error.message}`);
	}
}

let options = {
	hostname: "api.openai.com",
	port: 443,
	path: "/v1/completions",
	method: "POST",
	headers: {
		"Content-Type": "application/json",
		Authorization: "Bearer " + "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",
	},
};

//JSON文件增删改查----------------------------------------------------------------

let writeJson = (toWrite, path_way) => {
	console.log("尝试在 " + path_way + " 中写入数据 " + JSON.stringify(toWrite));

	fs.readFile(path_way, (err, data) => {
		if (err) return console.error("读取文件失败：", err);

		let thisJSONStr = data.toString(); //将二进制数据转为字符串
		let thisJSON = JSON.parse(thisJSONStr); //将字符串转换为 json 对象
		thisJSON.data.push(toWrite); //将传来的对象 push 进数组对象中

		thisJSON.total = thisJSON.data.length; //定义一下总条数，为以后的分页打基础
		thisJSONStr = JSON.stringify(thisJSON);
		fs.writeFile(path_way, thisJSONStr, (err) => {
			if (err) console.error("重写失败：", err);
			else console.log("写入成功");
		});
	});
};

let deleteJson = (id, path_way) => {
	console.log("尝试在 " + path_way + " 中删除数据 " + id);

	fs.readFile(path_way, (err, data) => {
		if (err) return console.error("读取文件失败：", err);

		let thisJSONStr = data.toString();
		let thisJSON = JSON.parse(thisJSONStr);

		let temp = thisJSON.data.some((val, index) => {
			if (id === val.id) thisJSON.data.splice(index, 1);
			return id === val.id;
		});

		if (!temp) {
			console.log("找不到对象");
			return false;
		}

		thisJSON.total = thisJSON.data.length;
		thisJSONStr = JSON.stringify(thisJSON);
		fs.writeFile(path_way, thisJSONStr, (err) => {
			if (err) console.error("重写失败：", err);
			else console.log("删除成功");
		});
	});
};

let changeJson = (toChange, path_way) => {
	console.log("尝试在 " + path_way + " 中修改数据 " + JSON.stringify(toChange));
	fs.readFile(path_way, (err, data) => {
		if (err) return console.error("读取文件失败：", err);
		let thisJSONStr = data.toString();
		let thisJSON = JSON.parse(thisJSONStr);

		let temp = thisJSON.data.some((val) => {
			if (toChange.id === val.id) {
				for (let key in toChange) {
					//if (val[key] !== undefined) {
					val[key] = toChange[key];
					//}
				}
			}
			return toChange.id == val.id;
		});

		if (!temp) {
			thisJSON.data.push(toChange);
			console.log("找不到对象，追加成功");
		} else console.log("修改完成");

		thisJSON.data.sort(compUser);
		console.log("排序完成");

		thisJSON.total = thisJSON.data.length;
		thisJSONStr = JSON.stringify(thisJSON);
		writeQueue.push({ path_way, thisJSONStr }, writeQueueCallBack);
		writing = true;
		console.log("已加入文件写队列");
	});
};

let queryJSON = (id, path_way) => {
	console.log("尝试在 " + path_way + " 中查询数据 " + id);

	let data = fs.readFileSync(path_way);
	if (data === null) return console.error("读取失败");
	let thisJSONStr = data.toString();
	let thisJSON = JSON.parse(thisJSONStr);

	for (let val of thisJSON.data) {
		if (id === val.id) {
			console.log("找到对象 " + JSON.stringify(val));
			return val;
		}
	}

	console.log("找不到对象");
	return null;
};

let queryJSONAll = (path_way) => {
	console.log("尝试在 " + path_way + " 中查询所有数据");

	let data = fs.readFileSync(path_way);
	if (data === null) return console.error("读取失败");
	let thisJSONStr = data.toString();
	let thisJSON = JSON.parse(thisJSONStr);

	console.log("找到对象");
	return thisJSON.data;
};

let writing = false;

let writeQueue = asyncTask.queue(({ path_way, thisJSONStr }, callBack) => {
	fs.writeFileSync(path_way, thisJSONStr);
	callBack(null, writeQueue.length());
}, 1);

writeQueue.drain(() => {
	writing = false;
	console.log("所有文件写操作执行完毕！");
});

let writeQueueCallBack = (err, rest) => {
	if (err) console.error("文件写队列发生错误", err);
	console.log("文件写队列剩余任务数量：" + rest);
};

//HTML编辑器与无头渲染器----------------------------------------------------------------

const worldFilter = [
	["水晶塔", "银泪湖", "太阳海岸", "伊修加德", "红茶川"],
	["紫水栈桥", "延夏", "静语庄园", "摩杜纳", "海猫茶屋", "柔风海湾", "琥珀原"],
	["潮风亭", "神拳痕", "白银乡", "白金幻象", "旅人栈桥", "拂晓之间", "龙巢神殿", "梦羽宝境"],
	["拉诺西亚", "幻影群岛", "神意之地", "萌芽池", "红玉海", "宇宙和音", "沃仙曦染", "晨曦王座"],
];

let getFFXIV = async (keyw) => {
	let buf = await getURLBuffer("https://cafemaker.wakingsands.com/search?string=" + keyw);
	console.log("已获取到第一次查询结果");
	let Jbuf = JSON.parse(buf);
	//console.log("Jbuf.Results:", Jbuf.Results);
	let nameMap = new Map();
	let IDs = new Array();
	IDs.push(0);
	for (let val of Jbuf.Results) {
		IDs.push(val.ID);
		nameMap[val.ID] = val.Name;
	}
	//console.log(IDs.toString());
	buf = await getURLBuffer("https://universalis.app/api/v2/中国/" + IDs.toString());
	console.log("已获取到第二次查询结果");
	Jbuf = JSON.parse(buf);
	//console.log("Jbuf:", Jbuf);
	let replyMsg = "";
	let cnt = 0;
	for (let ID of IDs) {
		if (Jbuf.unresolvedItems.some((item) => item === ID)) continue;
		cnt++;
		if (cnt > 5) {
			replyMsg += "匹配结果过多，只显示前五个\n";
			break;
		}
		replyMsg += nameMap[ID] + "\n";
		let listcnt = 0;
		for (let listing of Jbuf.items[ID].listings) {
			if (listcnt < 3 && worldFilter.some((item) => item === listing.worldName)) {
				listcnt++;
				replyMsg += listing.pricePerUnit + "G x " + listing.quantity + " from " + listing.retainerName + "@" + listing.worldName + "\n";
			}
		}
	}
	return replyMsg;
};

let makeElementImg = (src) => {
	return {
		type: "element",
		tagName: "img",
		properties: { src: src, style: "margin: -5px 5px; border: solid 5px transparent; border-radius: 5px;" },
		children: [],
	};
};

let makeElementText = (tagName, color, text) => {
	return {
		type: "element",
		tagName: tagName,
		properties: { style: `color: ${color};` },
		children: [{ type: "text", value: text }],
	};
};

let makeElementBr = () => {
	return {
		type: "element",
		tagName: "br",
		properties: {},
		children: [],
	};
};

let makeElementHTML = (rawHTML) => {
	return unified().use(rehypeParse).parse(rawHTML);
};

let rawHTMLVisitor = async (rawHTML) => {
	return (node) => node.children.push(makeElementHTML(rawHTML));
};

let MarkdownVisitor = async (MarkdownText) => {
	let rawHTML = String(await unified().use(remarkParse).use(remarkMath).use(remarkRehype).use(rehypeMathjax).use(rehypeStringify).process(MarkdownText));
	return rawHTMLVisitor(rawHTML);
};

let FFXIVVisitor = async (rawKeyw) => {
	let keyw = rawKeyw.replace(/[0-9]/g, "");
	let pos = rawKeyw.includes("0") ? 0 : rawKeyw.includes("1") ? 1 : rawKeyw.includes("2") ? 2 : rawKeyw.includes("3") ? 3 : 1;
	let buf = await getURLBuffer(`https://cafemaker.wakingsands.com/search?string=${keyw}&indexes=item`);
	console.log("已获取到第一次查询结果");
	let Jbuf = JSON.parse(buf);
	let IDs = new Array();
	let nameMap = new Map();
	let imgMap = new Map();
	IDs.push(0);
	IDs.push(1);
	for (let val of Jbuf.Results) {
		IDs.push(val.ID);
		nameMap[val.ID] = val.Name;
		imgMap[val.ID] = val.Icon;
	}

	buf = await getURLBuffer(`https://universalis.app/api/v2/中国/${IDs.toString()}?entries=100`);
	console.log("已获取到第二次查询结果");
	Jbuf = JSON.parse(buf);
	if (IDs.length === Jbuf.unresolvedItems.length)
		return (node) => {
			node.children.push(makeElementText("div", "aliceblue", "JiouBot v1.3.1 Debug"));
			node.children.push(makeElementText("div", "aliceblue", "一条搜索结果都没有哦~"));
		};
	else
		return (node) => {
			let cnt = 0;
			node.children.push(makeElementText("div", "aliceblue", "JiouBot v1.3.1 Debug"));
			IDs.some((ID) => {
				if (cnt > 10) return true;
				if (Jbuf.unresolvedItems.some((item) => item === ID)) return false;
				cnt++;
				node.children.push(makeElementBr());
				let heading = makeElementText("div", `aliceblue; width: max-content`, "");
				heading.children.push(makeElementText("span", "aliceblue; font-size: 50px; font-weight: bold", nameMap[ID]));
				heading.children.push(makeElementImg("https://cafemaker.wakingsands.com" + imgMap[ID]));
				heading.children.push(makeElementText("div", "grey", "最后更新于 " + new Date(Jbuf.items[ID].lastUploadTime).toLocaleString("zh-CN")));
				heading.children.push(makeElementText("span", "lightgrey", "正在出售: "));
				heading.children.push(makeElementBr());
				let listcnt = 0;
				Jbuf.items[ID].listings.some((listing) => {
					if (listcnt >= 10) return true;
					if (worldFilter[pos].some((item) => item === listing.worldName)) {
						listcnt++;
						heading.children.push(makeElementText("span", "rgb(255, 229, 136)", listing.pricePerUnit + "G x " + listing.quantity));
						if (listing.hq) heading.children.push(makeElementText("span", "gold", " HQ"));
						else heading.children.push(makeElementText("span", "darkgrey", " NQ"));
						heading.children.push(makeElementText("span", "grey", " ← "));
						heading.children.push(makeElementText("span", "rgb(207, 170, 221)", listing.retainerName + "@" + listing.worldName));
						heading.children.push(makeElementBr());
					}
					return false;
				});
				heading.children.push(makeElementText("span", "lightgrey", "历史记录: "));
				heading.children.push(makeElementBr());
				listcnt = 0;
				Jbuf.items[ID].recentHistory.some((history) => {
					if (listcnt >= 5) return true;
					if (worldFilter[pos].some((item) => item === history.worldName)) {
						listcnt++;
						heading.children.push(makeElementText("span", "rgb(255, 229, 136)", history.pricePerUnit + "G x " + history.quantity));
						if (history.hq) heading.children.push(makeElementText("span", "gold", " HQ"));
						else heading.children.push(makeElementText("span", "darkgrey", " NQ"));
						heading.children.push(makeElementText("span", "grey", " → "));
						heading.children.push(makeElementText("span", "rgb(207, 170, 221)", history.buyerName + "@" + history.worldName));
						heading.children.push(makeElementBr());
						heading.children.push(makeElementText("span", "grey", "购买时间: " + new Date(history.timestamp * 1000).toLocaleString("zh-CN")));
						heading.children.push(makeElementBr());
					}
					return false;
				});
				node.children.push(heading);
				return false;
			});
		};
};

let buildHTML = (keyName, visitor) => {
	let RenderIn = unified()
		.use(rehypeParse)
		.parse(fs.readFileSync(keyName + "Render.html", "utf8"));

	visit(RenderIn, "element", (node) => {
		if (node.properties.id === keyName) visitor(node);
	});

	return unified().use(rehypeStringify).stringify(RenderIn);
};

let renderHTML = async (keyName, visitor) => {
	const browser = await puppeteer.launch({ headless: true });
	const page = await browser.newPage();
	await page.goto(`file:///home/mzero/JiouBot/${keyName}Render.html`, { waitUntil: "networkidle0" });
	try {
		await page.setContent(buildHTML(keyName, visitor));
	} catch (buildErr) {
		await browser.close();
		console.error(buildErr);
		throw "HTMLBuildException";
	}
	let clip = await page.evaluate(() => {
		let { x, y, width, height } = document.body.getBoundingClientRect();
		return { x, y, width, height };
	});
	let path = Math.random() + ".jpg";
	await page.screenshot({ path: path, type: "jpeg", clip: clip });
	await browser.close();
	return path;
};

client.on("message", async (e) => {
	//console.log(e);
	if (e.atme === false && e.raw_message.search(/jiou/) === -1) {
		let messageFiltered = e
			.toString()
			.replace(/\n|(\{.*\})/g, " ")
			.replace(/\s*/, "");
		if (e.group_id !== undefined && messageFiltered.replace(/\s/g, "") !== "") fs.writeFileSync(`./ChatRec/${e.group_id}.txt`, messageFiltered + "\n\n", { flag: "a+" });
		return;
	}

	console.log("收到触发消息，raw内容为：\n" + e.raw_message);

	console.log("查询频繁队列：" + e.sender.user_id + " --- " + userTiming.get(e.sender.user_id));

	if (userTiming.get(e.sender.user_id) === undefined) userTiming.set(e.sender.user_id, 10);

	if (userTiming.get(e.sender.user_id) === 0) {
		e.reply("我劝你别急，再等5分钟", false);
		return;
	}

	userTiming.set(e.sender.user_id, userTiming.get(e.sender.user_id) - 1);
	setTimeout(() => {
		userTiming.set(e.sender.user_id, userTiming.get(e.sender.user_id) + 1);
		console.log("账号 " + e.sender.user_id + " 恢复一次频繁次数");
	}, 300000);

	//TeX渲染
	if (e.raw_message.search(/jioutex/) !== -1) {
		let keyw = e.raw_message.replace(/jioutex/g, "");
		if (keyw === "") {
			e.reply("你咋啥都没让我渲染呢", false);
			return;
		}
		console.log("收到渲染 TeX 请求，渲染内容为：\n" + keyw);
		let renderPath;
		try {
			renderPath = await renderHTML("TeX", await MarkdownVisitor(`$$\n${keyw}\n$$`));
		} catch (renderErr) {
			console.error("查询结果渲染发生错误: \n" + renderErr);
			e.reply("你这说的些啥啊，给我整不会了", false);
			return;
		}
		console.log("TeX 渲染完毕，保存至 " + renderPath);
		await e.reply({ file: renderPath, type: "image" }, false);
		console.log("发送成功，正在删除渲染缓存");
		fs.unlinkSync(renderPath);
		console.log("缓存删除成功");
		return;
	}

	//Markdown渲染
	if (e.raw_message.search(/jioumd/) !== -1) {
		let keyw = e.raw_message.replace(/jioumd/g, "");
		if (keyw === "") {
			e.reply("你咋啥都没让我渲染呢", false);
			return;
		}
		console.log("收到渲染 Markdown 请求，渲染内容为：\n" + keyw);
		let renderPath;
		try {
			renderPath = await renderHTML("MD", await MarkdownVisitor(keyw));
		} catch (renderErr) {
			console.error("查询结果渲染发生错误: \n" + renderErr);
			e.reply("你这说的些啥啊，给我整不会了", false);
			return;
		}
		console.log("Markdown 渲染完毕，保存至 " + renderPath);
		await e.reply({ file: renderPath, type: "image" }, false);
		console.log("发送成功，正在删除渲染缓存");
		fs.unlinkSync(renderPath);
		console.log("缓存删除成功");
		return;
	}

	//查询FFXIV市场
	if (e.raw_message.search(/ffxiv/) !== -1) {
		let keyw = e.raw_message.substring(e.raw_message.search(/ffxiv/));
		keyw = keyw.replace(/ffxiv/g, "").replace(/\s/g, "");
		if (keyw === "") {
			e.reply("你咋啥都没搜呢", false);
			return;
		}
		console.log("收到查询 FF14 请求，查询关键词为：\n" + keyw);
		let renderPath;
		try {
			renderPath = await renderHTML("FFXIV", await FFXIVVisitor(keyw));
		} catch (renderErr) {
			console.error("查询结果渲染发生错误: \n" + renderErr);
			e.reply("你这说的些啥啊，给我整不会了", false);
			return;
		}
		console.log("查询结果渲染完毕，保存至 " + renderPath);
		await e.reply({ file: renderPath, type: "image" }, false);
		console.log("发送成功，正在删除渲染缓存");
		fs.unlinkSync(renderPath);
		console.log("缓存删除成功");
		return;
	}

	//查询ChatGPT
	if (e.raw_message.search(/chat /) !== -1) {
		let pmt = e.raw_message.substring(e.raw_message.search(/chat /));
		pmt = pmt.substring(pmt.search(/ /) + 1);
		if (pmt === "") {
			e.reply("你咋啥都没问呢", false);
			return;
		}
		console.log("收到 Chat 请求，查询关键词为：\n" + pmt);
		e.reply("你说" + pmt + "是吧，让我想想", false);
		/*
		let data = JSON.stringify({
			model: "text-davinci-003",
			prompt: pmt,
			temperature: 0,
			max_tokens: 2048,
		});
		let ans = await reqOptBuffer(options, data);
		let Jans = JSON.parse(ans);
		console.log("已获取到查询结果，raw结果为：\n" + ans);
		e.reply("ChatGPT的回复是：" + Jans.choices[0].text, false);
		*/
		//let ans = await callChatGPT(pmt);new Promise((resolve, reject) => {
		try {
			console.log(
				await new Promise((resolve, reject) => {
					childp.exec(
						"cd GPT2-Chinese && python3 ./generate.py --length=80 --nsamples=1 --fast_pattern --model_path ./model/chat/ --save_samples --save_samples_path=./opt --prefix=" + pmt,
						{
							encoding: "utf-8",
						},
						(error, stdout, stderr) => {
							if (error) reject(stderr);
							else resolve(stdout);
						}
					);
				})
			);
		} catch {
			console.log("调用 Python 接口错误");
			e.reply("给 CPU 整报错了，真给整不会了", false);
			return;
		}
		let ans = await getFileRaw("./GPT2-Chinese/opt/samples.txt");
		console.log("已获取到查询结果，raw结果为：\n" + ans);
		if (ans === undefined) e.reply("给 CPU 整空白了，真给整不会了", false);
		else e.reply(ans, true);
		return;
	}

	//注册
	if (e.raw_message.search(/register/) !== -1) {
		console.log("检测到 register 注册或重置 请求");

		changeJson(
			{
				id: e.sender.user_id,
				Money: 100,
				Growlimit: 10,
				Growing: [],
				Inventory: [],
			},
			"./data.json"
		);

		e.reply("你叫 " + e.sender.user_id + " 是吧？好，我记下来了", false);
		return;
	}

	//信息
	if (e.raw_message.search(/info/) !== -1) {
		console.log("检测到 info 查询用户信息 请求");

		if (writing) {
			e.reply("服务器繁忙，请稍后再试", true);
			return;
		}

		let userData = queryJSON(e.sender.user_id, "./data.json");
		if (userData === null) {
			e.reply("请先注册哦", true);
			return;
		}
		console.log("查询到用户" + JSON.stringify(userData));
		e.reply("账号id：" + userData.id + "\nJiou币：" + userData.Money, true);
		return;
	}

	//查询帮助
	if (e.raw_message.search(/help/) !== -1) {
		e.reply(HELPTEXT, false);
		return;
	}

	//默认
	e.reply("已收到消息，使用 jiou help 触发帮助", true);
});

//setInterval();

client.on("notice.group.increase", (e) => {
	console.log("触发进群事件");
	//e.group.sendMsg("侦测到账号 " + e.user_id.toString() + " 进群");
});

client.on("notice.group.decrease", (e) => {
	console.log("触发退群事件");
	e.group.sendMsg("侦测到账号 " + e.user_id.toString() + " 退群");
});
