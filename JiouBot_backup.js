"use strict";
const { createClient, core } = require("oicq");
const fs = require("fs");
const async = require("async");

const account = fs.readFileSync("User.txt").toString();
const client = createClient(account);

const HELPTEXT =
	"JiouBot v0.0.5 debug\n" +
	"要触发我，请at我或在消息中加入'jiou'关键词\n" +
	"支持好友私聊\n" +
	"操作间隔低于一分钟自动忽略\n" +
	"用户群 631371483\n" +
	"help 显示此文字\n" +
	"register 注册或重置\n" +
	"info 查询用户信息\n" +
	"ecos 玩游戏";

const GAMETEXT =
	"JiouEcoS v0.0.5 debug\n" +
	"ecos plant 种地\n" +
	"ecos shop 商店\n" +
	"ecos rank 全球排行榜\n" +
	"\n功能开发中……";

const PLANTTEXT =
	"ecos plant list 查看作物市场\n" +
	"ecos plant #作物编号 作物信息\n" +
	"ecos plant 作物编号 数量 种几个\n" +
	"ecos plant growing 查看田地\n" +
	"ecos plant harvest 收获";

const SHOPTEXT = "ecos shop list 查看商店列表\n" + "ecos shop buy 商品编号 买下商品\n";

const RESO = require("./reso.json");
const PLANT = RESO.plant;
const SHOP = RESO.shop;

client.on("system.login.qrcode", function (e) {
	console.log("扫码完成后请按回车");
	process.stdin.once("data", () => {
		this.login();
	});
});

client
	.on("system.login.slider", function (e) {
		console.log("输入ticket：");
		process.stdin.once("data", (ticket) => this.submitSlider(String(ticket).trim()));
	})
	.login();

client.on("system.online", () => console.log("系统已登入，当前时间" + Date.now()));

client.on("request.friend", (e) => {
	e.approve(true);
});

client.on("request.group.invite", (e) => {
	e.approve(true);
});

let userTiming = new Map();

//文件读写定义----------------------------------------------------------------
let writing = false;

let compUser = (a, b) => {
	return b.Money - a.Money;
};

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

let writeQueue = async.queue(({ path_way, thisJSONStr }, callBack) => {
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

//主要事件定义----------------------------------------------------------------

client.on("message", (e) => {
	//console.log(e);
	if (e.atme === false && e.raw_message.match(/jiou/) === null) return;

	//e.reply("已收到消息", true); //true表示引用对方的消息

	console.log("收到触发消息，raw内容为：\n" + e.raw_message);

	console.log("查询频繁队列：" + e.sender.user_id + "-" + userTiming.get(e.sender.user_id));

	if (userTiming.get(e.sender.user_id) === true) {
		e.reply("操作太快了，请休息一下", false);
		return;
	}

	userTiming.set(e.sender.user_id, true);
	setTimeout(() => {
		userTiming.set(e.sender.user_id, false);
	}, 60000);

	//查询帮助
	if (e.raw_message.match(/help/) !== null) {
		e.reply(HELPTEXT, false);
		return;
	}

	//注册
	if (e.raw_message.match(/register/) !== null) {
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

		e.reply("账号 " + e.sender.user_id + " 的数据注册或重置好了！", false);
		return;
	}

	//玩游戏
	if (e.raw_message.match(/ecos/) !== null) {
		console.log("检测到 ecos 玩游戏 请求");

		if (writing) {
			e.reply("服务器繁忙，请稍后再试", true);
			return;
		}

		let userData = queryJSON(e.sender.user_id, "./data.json");
		if (userData === null) {
			e.reply("请先注册再游玩哦", true);
			return;
		}

		//全球排行榜
		if (e.raw_message.match(/rank/) !== null) {
			console.log("检测到 ecos rank 全球排行榜 请求");

			let userList = queryJSONAll("./data.json");
			let rankText = "全球 Jiou币 排行榜：\n";

			userList.some((val, index) => {
				if (index < 10) {
					rankText += "No." + (index + 1) + " 尾号" + (val.id % 10) + " " + val.Money + "\n";
					return false;
				}
				return true;
			});
			console.log("榜内查询完毕");

			rankText += "你的：";
			userList.some((val, index) => {
				if (val.id === userData.id) {
					rankText += "No." + (index + 1);
					return true;
				}
				return false;
			});
			rankText += " 尾号" + (userData.id % 10) + " " + userData.Money;
			console.log("榜外查询完毕");

			e.reply(rankText, false);
			return;
		}

		//种地
		if (e.raw_message.match(/plant/) !== null) {
			console.log("检测到 ecos plant 种地 请求");

			//作物列表
			if (e.raw_message.match(/list/) !== null) {
				console.log("检测到 ecos plant list 查看作物市场 请求");
				let plantEco = queryJSON("plant", "./economy.json");
				let plantlist = "作物 产量-种子\n";
				PLANT.some((val, index) => {
					plantlist +=
						index +
						". " +
						val.name +
						" " +
						(val.Basic_Sell * val.Basic_Yield * plantEco.prefix[index]) / 100 +
						"-" +
						Math.round(val.Seed_Cost * plantEco.seed[index]) / 100 +
						"\n";
				});
				e.reply(plantlist, false);
				return;
			}

			//种下的作物
			if (e.raw_message.match(/growing/) !== null) {
				console.log("检测到 ecos plant growing 查看田地 请求");
				let growingText = "按照种植时间列出：";
				userData.Growing.some((val) => {
					growingText += "\n" + PLANT[val.plantId].name + " " + val.plantNumber + " 个";
					return false;
				});
				e.reply(growingText, true);
				return;
			}

			//收获
			if (e.raw_message.match(/harvest/) !== null) {
				console.log("检测到 ecos plant harvest 收获 请求");
				let cnt = 0;
				let profit = 0;
				let timeNow = Date.now();
				let plantEco = queryJSON("plant", "./economy.json");
				while (
					userData.Growing.some((val, index) => {
						if (timeNow - val.time > PLANT[val.plantId].Grow_Time * 1000) {
							console.log("检测到可以收获的作物");
							cnt += val.plantNumber;
							profit += Math.ceil(
								(PLANT[val.plantId].Basic_Sell *
									PLANT[val.plantId].Basic_Yield *
									val.plantNumber *
									plantEco.prefix[val.plantId]) /
									100
							);

							console.log("收获完成，正在计算市场影响");
							while (val.plantNumber-- > 0 && plantEco.prefix[val.plantId] > 0) {
								plantEco.prefix[Math.floor(Math.random() * 2333) % 7]++;
								plantEco.prefix[val.plantId]--;
								break;
							}

							console.log("计算完成！");
							userData.Growing.splice(index, 1); //直接改变本体数组会导致some类似于直接退出
							return true;
						}
						return false;
					})
				);

				userData.Money += profit;

				changeJson(userData, "./data.json");
				changeJson(plantEco, "./economy.json");

				e.reply("收获了 " + cnt + " 个作物，共赚得 " + profit + " 个Jiou币", true);
				return;
			}

			let numPos = e.raw_message.search(/[0-9]/);
			let numStr = e.raw_message.substring(numPos);
			console.log("数字解析结果：" + numStr);
			//输入了数字
			if (e.raw_message.match(/[0-9]/) !== null) {
				let plantId = parseInt(numStr);
				let plant = PLANT[plantId];
				if (plant === undefined) {
					e.reply("没有这种作物哦", true);
					return;
				}

				//作物信息
				if (e.raw_message.match(/#/) !== null) {
					console.log("检测到 ecos plant #作物编号 作物信息 请求");
					e.reply(
						"作物名称：" +
							plant.name +
							"\n基础售价：" +
							plant.Basic_Sell +
							"\n种子基础花费：" +
							plant.Seed_Cost +
							"\n生长用时：" +
							plant.Grow_Time +
							" 秒\n基础产量：" +
							plant.Basic_Yield,
						false
					);
					return;
				}

				//种几个
				if (e.raw_message.match(/#/) === null) {
					console.log("检测到 ecos plant 作物编号 数量 种几个 请求");

					let plantEco = queryJSON("plant", "./economy.json");
					let plantNumber = 1;
					numPos = numStr.search(/[^0-9]/);
					if (numPos !== -1) {
						numStr = numStr.substring(numPos);
						numPos = numStr.search(/[0-9]/);
						numStr = numStr.substring(numPos);
						console.log("数字解析结果：" + numStr);
						if (numStr.match(/[0-9]/) !== null) plantNumber = parseInt(numStr);
					}

					if (plantNumber === 0) {
						e.reply("种 0 个，我选择不种", true);
						return;
					}

					let growingNumber = 0;
					userData.Growing.some((val) => {
						growingNumber += val.plantNumber;
						return false;
					});

					if (growingNumber + plantNumber > userData.Growlimit) {
						e.reply(
							"你的地里塞不下这么多种子！最多还能种 " +
								(userData.Growlimit - growingNumber) +
								" 个作物",
							true
						);
						return;
					}

					if (
						userData.Money <
						Math.ceil((plant.Seed_Cost * plantNumber * plantEco.seed[plantId]) / 100)
					) {
						e.reply("你太穷了，买不起它的种子！", true);
						return;
					}

					userData.Money -= Math.floor(
						(plant.Seed_Cost * plantNumber * plantEco.seed[plantId]) / 100
					);
					userData.Growing.push({
						plantId: plantId,
						plantNumber: plantNumber,
						time: Date.now(),
					});

					changeJson(userData, "./data.json");

					e.reply(
						"花费 " +
							Math.ceil((plant.Seed_Cost * plantNumber * plantEco.seed[plantId]) / 100) +
							" 个Jiou币种植了 " +
							plantNumber +
							" 个" +
							plant.name +
							"，在 " +
							plant.Grow_Time +
							"秒 后成熟",
						true
					);

					console.log("种植完成，正在计算市场影响");
					while (plantNumber > 0) {
						let seedId = Math.floor(Math.random() * 2333) % 7;
						if (plantEco.seed[seedId] < 1) continue;
						plantEco.seed[seedId]--;
						plantEco.seed[plantId]++;
						plantNumber--;
						break;
					}

					console.log("计算完成！");
					changeJson(plantEco, "./economy.json");

					return;
				}
			}

			//默认
			e.reply(PLANTTEXT, false);
			return;
		}

		//商店
		if (e.raw_message.match(/shop/) !== null) {
			//商店列表
			if (e.raw_message.match(/list/) !== null) {
				console.log("检测到 ecos shop list 查看商店列表 请求");
				let shoplist = "商店列表：\n";
				SHOP.some((val, index) => {
					shoplist +=
						index +
						". " +
						val.name +
						": " +
						val.Basic_Cost +
						" Jiou币\n描述：" +
						val.description +
						"\n";
					return false;
				});
				e.reply(shoplist, false);
				return;
			}

			//买下商品
			if (e.raw_message.match(/buy/) !== null) {
				console.log("检测到 ecos shop buy 商品编号 买下商品 请求");

				let numPos = e.raw_message.search(/[0-9]/);
				let numStr = e.raw_message.substring(numPos);
				console.log("数字解析结果：" + numStr);
				if (e.raw_message.match(/[0-9]/) === null) return;

				let shopId = parseInt(numStr);
				let shop = SHOP[shopId];
				if (shop === undefined) {
					e.reply("没有这种商品哦", true);
					return;
				}

				if (userData.Money < shop.Basic_Cost) {
					e.reply("你太穷了，买不起它！", true);
					return;
				}

				userData.Money -= shop.Basic_Cost;
				if (userData.Inventory === undefined) userData.Inventory = [];

				if (shop.name === "五块耕地") userData.Growlimit += 5;
				else
					userData.Inventory.push({
						shopId: shopId,
						time: Date.now(),
					});

				changeJson(userData, "./data.json");

				e.reply("花费 " + shop.Basic_Cost + " 个Jiou币购买了" + shop.name + "！", true);
				return;
			}
			e.reply(SHOPTEXT, false);
			return;
		}

		//默认
		e.reply(GAMETEXT, false);
		return;
	}

	//信息
	if (e.raw_message.match(/info/) !== null) {
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

	//默认
	e.reply("已收到消息，使用 jiou help 触发帮助", true);
});

//setInterval();

client.on("notice.group.increase", (e) => {
	console.log("触发进群事件");
	e.group.sendMsg("侦测到账号 " + e.user_id.toString() + " 进群");
});

client.on("notice.group.decrease", (e) => {
	console.log("触发退群事件");
	e.group.sendMsg("侦测到账号 " + e.user_id.toString() + " 退群");
});
