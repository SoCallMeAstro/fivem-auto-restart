const vscode = require("vscode"); const rcon = require("rcon"); const path = require("path")
let rconconnection; let Connected = false; let FailedLogin = false; let ConnectionResponse = {type: "", message: ""}; const MessagePrefix = "[fivem-auto-restart]"; let WorkspaceState

const IgnoredFolders = ["node_modules", "src", "source", ".github", "stream"]
const IgnoredFiles = [".svelte", "gitignore", ".md"]

let SavedServer
let ExtentionIcon

const StatusIcons = {
	["connect"]: {
		text: "$(debug-continue) Connect",
		tooltip: "Click to connect",
		command: "fivem-auto-restart.connect"
	},
	["disconnect"]: {
		text: "$(debug-disconnect) Disconnect",
		tooltip: "Click to disconnect",
		command: "fivem-auto-restart.disconnect"
	},
}

const DirectoryCheck = (Directory) => {
	const ResourceIndex = Directory.indexOf("resources/")
    if (ResourceIndex !== -1) Directory = Directory.slice(ResourceIndex + 9);
    if (IgnoredFiles.some(entry => Directory.includes(entry))) return false;
    if (IgnoredFolders.some(entry => Directory.includes(entry))) return false;
    return true
}

const NotifyHandler = (data) => {
	if (data.type === "error") vscode.window.showErrorMessage(`${MessagePrefix} ${data.message}`);
	if (data.type === "info") vscode.window.showInformationMessage(`${MessagePrefix} ${data.message}`);
	if (data.type === "warn") vscode.window.showWarningMessage(`${MessagePrefix} ${data.message}`);
}

const DisconnectHandler = () => { if (rconconnection) rconconnection = null; FailedLogin = false }

const ConnectionHandler = (password) => { 
	if (!rconconnection) {
		rconconnection = new rcon(SavedServer.ip, SavedServer.port, password, {tcp: false, challenge: false})
		rconconnection.on("auth", () => {
			rconconnection.send("refresh")
			setTimeout(() => {
				if (ConnectionResponse.type === "" && ConnectionResponse.message === "") {
					ConnectionResponse = {type: "error", message: "Couldn't connect to the server, is it online?"}
					FailedLogin = true
				}
				if (FailedLogin) DisconnectHandler();
				NotifyHandler(ConnectionResponse)
			}, 1000)
		})
		rconconnection.on("response", (response) => {
			if (response.includes("Invalid password")) {
				ConnectionResponse = {type: "error", message: "Invalid password entered, please try again"}
				Connected = false
				FailedLogin = true
			}
			if (response.includes("Scanning resources")) {
				ConnectionResponse = {type: "info", message: "Successfully connected to the server!"}; Connected = true
				ExtentionIcon.text = StatusIcons.disconnect.text; ExtentionIcon.tooltip = StatusIcons.disconnect.tooltip; ExtentionIcon.command = StatusIcons.disconnect.command
			}
		})
		rconconnection.on("end", () => {
			DisconnectHandler()
			ExtentionIcon.text = StatusIcons.connect.text; ExtentionIcon.tooltip = StatusIcons.connect.tooltip; ExtentionIcon.command = StatusIcons.connect.command
		})
		rconconnection.connect()

	} else {
		NotifyHandler({type: "error", message: "Already connected to a server, please disconnect first"})
	}
}

const IPChangeHandler = async () => {
	const ContextOptions = [{label: "Localhost", description: "Use your localhost server"}, {label: "Custom", description: "Connect to your VPS server"}]
	const ContextMenu = await vscode.window.showQuickPick(ContextOptions, {title: "Select a connetion type:", canPickMany: false})
	if (ContextMenu?.label.includes("Localhost")) WorkspaceState.update("fivem-auto-restart-connection", { ip: "127.0.0.1", port: "30120"});
	if (ContextMenu?.label.includes("Custom")) {
		const ContextOptions = [{label: "IP", description: "Edit IP"}, {label: "Port", description: "Edit Port"}]
		const ContextMenu = await vscode.window.showQuickPick(ContextOptions, {title: "Which would you like to edit?", canPickMany: false})
		const Input = await vscode.window.showInputBox({prompt: "Enter the " + ContextMenu?.label + " you would like to use", password: ContextMenu?.label === "IP" ? true : false})
		const InputType = ContextMenu?.label.toLowerCase()
		if (Input && Input !== "") {
			SavedServer[InputType] = Input
			WorkspaceState.update("fivem-auto-restart-connection", SavedServer)
		}
	}
}


let Cooldown = 0;
const activate = (context) => {
	WorkspaceState = context.workspaceState

	if (!WorkspaceState.get("fivem-auto-restart-connection")) {
		WorkspaceState.update("fivem-auto-restart-connection", { ip: "127.0.0.1", port: "30120"})
	}
	
	SavedServer = WorkspaceState.get("fivem-auto-restart-connection")
	ExtentionIcon = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0)
	ExtentionIcon.text = StatusIcons.connect.text; ExtentionIcon.tooltip = StatusIcons.connect.tooltip; ExtentionIcon.command = StatusIcons.connect.command
	ExtentionIcon.show()

	const connectcommand = vscode.commands.registerCommand("fivem-auto-restart.connect", async () => {
		const passwordinput = await vscode.window.showInputBox({prompt:  "Enter your rcon password", password: true})
		if (passwordinput && passwordinput !== "") ConnectionHandler(passwordinput);
	})
	const disconnectcommand = vscode.commands.registerCommand("fivem-auto-restart.disconnect", () => {
		if (rconconnection) {
			NotifyHandler({type: "warn", message: "Disconnected from the server"})
			rconconnection.disconnect()
		}
	})
	const ipcommand = vscode.commands.registerCommand("fivem-auto-restart.ipchange", IPChangeHandler)

	vscode.workspace.onDidSaveTextDocument(async (document) => {
		if (rconconnection) {
			const CurrentTime = Date.now()
			if (CurrentTime - Cooldown > 2000) {
				Cooldown = CurrentTime
				if (document.uri.scheme === "file" && await DirectoryCheck(document.uri.path)) {
					const SplitDirectory = path.posix.dirname(document.uri.path).split(path.posix.sep)
					const ResourceName = SplitDirectory.findIndex((part, index, parts) => {
						if (part.includes("[") && part.includes("]")) return parts[index + 1]
					})
					if (ResourceName !== -1 && ResourceName < SplitDirectory.length - 1) {
						if (document.uri.path.includes("fxmanifest.lua") || document.uri.path.includes("__resource.lua")) rconconnection.send("refresh");
						rconconnection.send(`ensure ${SplitDirectory[ResourceName + 1]}`)
					}
				}
			}
		}
	})

	context.subscriptions.push(connectcommand, disconnectcommand, ipcommand, ExtentionIcon)
}

const deactivate = () => {}

module.exports = {
	activate,
	deactivate
}