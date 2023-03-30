"use strict";
import { createClient, core } from "oicq";
import fs, { readSync } from "fs";
import https from "https";
import asyncTask from "async";
import childp from "child_process";
import { Configuration, OpenAIApi } from "openai";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import puppeteer from "puppeteer";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeMathjax from "rehype-mathjax";

const file = await unified().use(remarkParse).use(remarkMath).use(remarkRehype).use(rehypeMathjax).use(rehypeStringify).process(fs.readFileSync("./example.md"));

console.log(String(file));

let makeElementHTML = (rawHTML) => {
	console.log(rawHTML);
	return unified().use(rehypeParse).parse(rawHTML);
};

let addTeX = async (TeX, tree) => {
	//let rawHTML = await TeXtoHTML(TeX);
	let rawHTML = String(file);
	visit(tree, "element", (node) => {
		if (node.properties.id === "TeX") {
			node.children.push(makeElementHTML(rawHTML));
		}
	});
};

let buildHtmlTeX = async (TeX) => {
	let RenderIn = unified().use(rehypeParse).parse(fs.readFileSync("TeXRender.html", "utf8"));
	await addTeX(TeX, RenderIn);
	return unified().use(rehypeStringify).stringify(RenderIn);
};

let renderTeX = async (TeX) => {
	const browser = await puppeteer.launch({ headless: true });
	const page = await browser.newPage();
	await page.goto("file:///home/mzero/JiouBot/TeXRender.html", { waitUntil: "networkidle0" });
	try {
		await page.setContent(await buildHtmlTeX(TeX));
	} catch {
		await browser.close();
		throw "HTMLBuildException";
	}
	let clip = await page.evaluate(() => {
		let { x, y, width, height } = document.body.getBoundingClientRect();
		return { x, y, width, height };
	});
	let path = "TeXRenderResult" + ".jpg";
	await page.screenshot({ path: path, type: "jpeg", clip: clip, quality: 85 });
	await browser.close();
	return path;
};

renderTeX("\\sum_{n=1}^k1_n💊 一二三💊");
