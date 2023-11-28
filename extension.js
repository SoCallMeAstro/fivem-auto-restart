const vscode = require("vscode"); const rcon = require("rcon"); const path = require("path")
let Connection

const IgnoredFolders = ["node_modules", "src", "source", ".github", "stream"]
const IgnoredFiles = [".svelte", "gitignore", ".md"]

const DirectoryCheck = async (Directory) => {
    const resourcesIndex = Directory.indexOf("resources/");
    if (resourcesIndex !== -1) {
        Directory = Directory.slice(resourcesIndex + 9);
    }

    if (IgnoredFiles.some(entry => Directory.includes(entry))) return false;
    if (IgnoredFolders.some(entry => Directory.includes(entry))) return false;
    return true;
}

const RconDisconnect = () => {
	if (Connection) { Connection.disconnect(); Connection = null }
}

const RconConnection = (password) => {
	RconDisconnect()
	Connection = new rcon("127.0.0.1", "30120", password, {tcp: false, challenge: false})
	Connection.on("auth", () => { Connection.send("refresh"); vscode.window.showInformationMessage("Successfully Authenticated")})
	Connection.on("response", (response) => {
		if (response === "rint Invalid password") vscode.window.showErrorMessage("Invalid Rcon Password")
		if (response === "rint ^2Scanning resources.^7") vscode.window.showInformationMessage("Connected to FiveM Server")
	})
	Connection.on("end", () => vscode.window.showWarningMessage("Connection from FiveM Server Closed"))
	Connection.connect()
}

const activate = (context) => {
	vscode.workspace.onDidSaveTextDocument(async (document) => {
		if (document.uri.scheme === "file" && Connection && await DirectoryCheck(document.uri.path)) {
			const SplitDirectory = path.posix.dirname(document.uri.path).split(path.posix.sep)
			const ResourceName = SplitDirectory.findIndex((part, index, parts) => {
				if (part.includes("[") && part.includes("]")) return parts[index + 1]
			});
			if (ResourceName !== -1 && ResourceName < SplitDirectory.length - 1) {
				Connection.send(`ensure ${SplitDirectory[ResourceName + 1]}`)
			}
		}
	})

	const connect = vscode.commands.registerCommand("fivem-auto-restart.connect", async () => {
		const password = await vscode.window.showInputBox({placeHolder: "rconpassword", prompt: "Enter your FiveM Servers Rcon Password"})
		if (password && password !== "") RconConnection(password)
	})
	
	const disconnect = vscode.commands.registerCommand("fivem-auto-restart.disconnect", async () => RconDisconnect())
	
	context.subscriptions.push(connect);
	context.subscriptions.push(disconnect)
}

const deactivate = () => {}

module.exports = {
	activate,
	deactivate
}