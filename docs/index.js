import { stitch, Screen  } from '@google/stitch-sdk';
import 'dotenv/config'; // Make sure to read .env file
import fs from 'fs';
import sizeOf from 'image-size';

async function main() {
  try {
    console.log("1. Creating project...");
    var projects = await stitch.projects();
    var project = projects.filter(p => p.data.title === "Test Image to Image")[0];
    if (!project) {
      project = await stitch.createProject("Test Image to Image");
      console.log("-> Project created with ID:", project.id);
    } else {
      console.log("-> Project already exists with ID:", project.id);
    }
    
    const imagePath = "./test01.jpg";
    const imagePath2 = "./test02.jpg";
    const dimensions = sizeOf(imagePath);
    console.log(`-> Image dimensions for ${imagePath}: Width=${dimensions.width}, Height=${dimensions.height}`);

    var screen1 = (await project.upload(imagePath))[0];
    var screen2 = (await project.upload(imagePath2))[0];
    
    console.log(`-> Uploaded two screens: ${screen1.id}, ${screen2.id}`);

    // Dùng raw MCP tool call để truyền nhiều selectedScreenIds cùng lúc
    var rawResult = await stitch.callTool("edit_screens", {
      projectId: project.id,
      selectedScreenIds: [screen1.id, screen2.id],
      prompt: `Height: ${dimensions.height}, Width: ${dimensions.width}. Kết hợp 2 hình ảnh tham chiếu này.`,
      deviceType: "MOBILE",
      modelId: ""
    });

    var screen = rawResult.outputComponents?.[0]?.design?.screens?.[0];
    var screenId = screen?.id;
    console.log("-> Screen ID:", screenId);
    console.log("-> Download URL:", screen?.screenshot?.downloadUrl);
  } catch (error) {
    console.error("Error during execution:", error.message || error);
  }
}

main();
