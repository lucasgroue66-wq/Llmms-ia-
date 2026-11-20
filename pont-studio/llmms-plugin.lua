--[[ =============================================================
  Plugin llmms ia pour Roblox Studio  —  rien à télécharger !

  Installation (une seule fois) :
   1. Dans Roblox Studio : Explorer > ServerStorage > + > Script
   2. Colle tout ce code dedans
   3. Clic droit sur le Script > « Save as Local Plugin… » (Enregistrer comme plugin local)
   4. Supprime le Script de ServerStorage (le plugin est installé)
   5. Onglet Plugins > bouton « llmms ia » > tape le code affiché sur le site > Connecter
      (si Studio demande d'autoriser les requêtes HTTP vers le site : Autoriser)
================================================================ ]]
local HttpService = game:GetService("HttpService")
local Selection = game:GetService("Selection")
local CHS = game:GetService("ChangeHistoryService")
local InsertService = game:GetService("InsertService")
local RunService = game:GetService("RunService")
if RunService:IsRunning() and not RunService:IsEdit() then return end -- pas pendant les tests en jeu

local SITE = "https://ia-llmms-1.vercel.app"
local EMBED = "" -- rempli automatiquement par le site quand tu copies le plugin
local API = SITE .. "/api/studio"
local GREEN, RED, GREY = Color3.fromRGB(80, 220, 120), Color3.fromRGB(255, 110, 110), Color3.fromRGB(170, 170, 180)

-- ---------- interface ----------
local toolbar = plugin:CreateToolbar("llmms ia")
local button = toolbar:CreateButton("llmms ia", "Connecter Roblox Studio à llmms ia", "rbxasset://textures/StudioToolbox/AssetPreview/star_filled.png")
local widget = plugin:CreateDockWidgetPluginGui("llmms_ia_widget", DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, true, false, 320, 190, 280, 170))
widget.Title = "llmms ia"
local frame = Instance.new("Frame"); frame.Size = UDim2.fromScale(1, 1); frame.BackgroundColor3 = Color3.fromRGB(22, 23, 28); frame.Parent = widget
local pad = Instance.new("UIPadding"); pad.PaddingTop = UDim.new(0, 12); pad.PaddingLeft = UDim.new(0, 12); pad.PaddingRight = UDim.new(0, 12); pad.Parent = frame
local lay = Instance.new("UIListLayout"); lay.Padding = UDim.new(0, 8); lay.Parent = frame
local function label(txt, size, color)
	local l = Instance.new("TextLabel"); l.BackgroundTransparency = 1; l.Size = UDim2.new(1, 0, 0, size + 6); l.Font = Enum.Font.GothamBold
	l.TextSize = size; l.TextColor3 = color or Color3.new(1, 1, 1); l.TextXAlignment = Enum.TextXAlignment.Left; l.TextWrapped = true; l.Text = txt; l.Parent = frame; return l
end
label("🎮 llmms ia ↔ Roblox Studio", 16)
label("Tape le code affiché sur le site :", 13, GREY)
local box = Instance.new("TextBox"); box.Size = UDim2.new(1, 0, 0, 34); box.Font = Enum.Font.GothamBold; box.TextSize = 20
box.PlaceholderText = "ex. K7P2QX"; box.Text = plugin:GetSetting("llmms_code") or EMBED; box.ClearTextOnFocus = false
box.BackgroundColor3 = Color3.fromRGB(40, 42, 50); box.TextColor3 = Color3.new(1, 1, 1); box.Parent = frame
local btn = Instance.new("TextButton"); btn.Size = UDim2.new(1, 0, 0, 34); btn.Font = Enum.Font.GothamBold; btn.TextSize = 16
btn.Text = "Connecter"; btn.BackgroundColor3 = Color3.fromRGB(240, 170, 120); btn.TextColor3 = Color3.fromRGB(20, 20, 20); btn.Parent = frame
local status = label("⚪ Pas connecté", 13, GREY)
button.Click:Connect(function() widget.Enabled = not widget.Enabled end)
local function setStatus(t, c) status.Text = t; status.TextColor3 = c or GREY end

-- ---------- réseau ----------
local function request(method, url, body)
	local ok, res = pcall(function()
		return HttpService:RequestAsync({ Url = url, Method = method, Headers = { ["Content-Type"] = "application/json" }, Body = body and HttpService:JSONEncode(body) or nil })
	end)
	if not ok then return nil, tostring(res) end
	if not res.Success then return nil, "HTTP " .. res.StatusCode end
	local ok2, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
	if not ok2 then return nil, "réponse illisible" end
	return data
end

-- ---------- outils ----------
local function resolve(path)
	if not path or path == "" or path == "game" then return game end
	local cur = game
	for part in string.gmatch(path, "[^%.]+") do
		if part ~= "game" then
			local nxt = cur:FindFirstChild(part)
			if not nxt and cur == game then local ok, s = pcall(game.GetService, game, part); if ok then nxt = s end end
			if not nxt then return nil end
			cur = nxt
		end
	end
	return cur
end

local function record(name, fn)
	local id; pcall(function() id = CHS:TryBeginRecording(name) end)
	local r = table.pack(pcall(fn))
	if id then pcall(function() CHS:FinishRecording(id, Enum.FinishRecordingOperation.Commit) end) else pcall(function() CHS:SetWaypoint(name) end) end
	return table.unpack(r, 1, r.n)
end

local function runCode(src)
	local out = {}
	local function push(...) local t = {}; for i = 1, select("#", ...) do t[i] = tostring((select(i, ...))) end; table.insert(out, table.concat(t, " ")) end
	local fn, err = loadstring(src)
	if not fn then return "Erreur de syntaxe : " .. tostring(err), true end
	setfenv(fn, setmetatable({ print = push, warn = function(...) push("⚠", ...) end }, { __index = getfenv(1) }))
	local res = table.pack(record("llmms ia : code", fn))
	if not res[1] then table.insert(out, "Erreur : " .. tostring(res[2])); return table.concat(out, "\n"), true end
	for i = 2, res.n do table.insert(out, "→ " .. tostring(res[i])) end
	return #out > 0 and table.concat(out, "\n") or "OK (exécuté)", false
end

local function tree(path, depth)
	local root = resolve(path or "Workspace"); if not root then return "Introuvable : " .. tostring(path), true end
	depth = math.clamp(tonumber(depth) or 2, 1, 5)
	local lines, count = {}, 0
	local function walk(inst, d, indent)
		if count > 500 then return end
		count += 1
		local kids = inst:GetChildren()
		table.insert(lines, indent .. inst.Name .. " [" .. inst.ClassName .. "]" .. (#kids > 0 and (" (" .. #kids .. ")") or ""))
		if d < depth then for _, c in ipairs(kids) do walk(c, d + 1, indent .. "  ") end end
	end
	if root == game then
		for _, s in ipairs({ "Workspace", "ReplicatedStorage", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPlayer", "StarterPack", "Lighting", "SoundService", "Teams" }) do
			local ok, svc = pcall(game.GetService, game, s); if ok and svc then walk(svc, 1, "") end
		end
	else walk(root, 1, "") end
	return table.concat(lines, "\n") .. (count > 500 and "\n… (coupé)" or ""), false
end

local function getScript(path)
	local s = resolve(path); if not s or not s:IsA("LuaSourceContainer") then return "Script introuvable : " .. tostring(path), true end
	return s.Source, false
end
local function setScript(path, source, class)
	local s = resolve(path)
	return record("llmms ia : script", function()
		if not s then
			local parentPath, name = string.match(path, "^(.*)%.([^%.]+)$")
			local parent = resolve(parentPath or "ServerScriptService"); if not parent then error("dossier introuvable : " .. tostring(parentPath)) end
			s = Instance.new(class or "Script"); s.Name = name or path; s.Parent = parent
		end
		s.Source = source
	end) and ("Script écrit : " .. s:GetFullName()) or "Erreur d'écriture", false
end
local function insertModel(id)
	local model = InsertService:LoadAsset(tonumber(id))
	local names = {}
	record("llmms ia : modèle", function()
		for _, c in ipairs(model:GetChildren()) do c.Parent = workspace; table.insert(names, c.Name) end
	end)
	return "Inséré dans Workspace : " .. table.concat(names, ", "), false
end
local function searchModels(q)
	local pages = InsertService:GetFreeModels(q, 0)
	local out = {}
	for i, r in ipairs(pages[1] and pages[1].Results or {}) do
		if i > 10 then break end
		table.insert(out, string.format("%d · %s (par %s)", r.AssetId, r.Name, r.CreatorName or "?"))
	end
	return #out > 0 and table.concat(out, "\n") or "Aucun modèle trouvé", false
end
local function getSelection()
	local out = {}
	for _, s in ipairs(Selection:Get()) do table.insert(out, s:GetFullName() .. " [" .. s.ClassName .. "]") end
	return #out > 0 and table.concat(out, "\n") or "Rien n'est sélectionné", false
end

local TOOLS = {
	run_code = function(a) return runCode(a.code or a.command or "") end,
	get_tree = function(a) return tree(a.path, a.depth) end,
	get_script = function(a) return getScript(a.path) end,
	set_script = function(a) return setScript(a.path, a.source or "", a.class) end,
	insert_model = function(a) return insertModel(a.assetId or a.id) end,
	search_models = function(a) return searchModels(a.query or "") end,
	get_selection = function() return getSelection() end,
}

local function handle(cmd)
	local f = TOOLS[cmd.tool]
	local text, isErr
	if not f then text, isErr = "Outil inconnu : " .. tostring(cmd.tool), true
	else
		local ok, t, e = pcall(f, cmd.args or {})
		if ok then text, isErr = t, e else text, isErr = "Erreur : " .. tostring(t), true end
	end
	request("POST", API, { op = "result", code = plugin:GetSetting("llmms_code"), id = cmd.id, text = tostring(text), isError = isErr and true or false })
end

-- ---------- boucle ----------
local session = 0
local function start(code)
	session += 1
	local my = session
	plugin:SetSetting("llmms_code", code)
	setStatus("⏳ Connexion…", GREY)
	task.spawn(function()
		local lastCmd = 0
		while my == session do
			local data, err = request("GET", API .. "?op=poll&code=" .. code .. "&place=" .. HttpService:UrlEncode(game.Name))
			if data and data.cmds then
				setStatus("🟢 Connecté à llmms ia (" .. code .. ")", GREEN)
				if #data.cmds > 0 then lastCmd = os.clock() end
				for _, c in ipairs(data.cmds) do task.spawn(handle, c) end
				task.wait(os.clock() - lastCmd < 60 and 1 or 4)
			else
				setStatus("🔴 " .. tostring(err) .. " — vérifie le code / autorise HTTP", RED)
				task.wait(5)
			end
		end
	end)
end
btn.MouseButton1Click:Connect(function()
	local code = string.upper((box.Text:gsub("%s", "")))
	if #code < 6 then setStatus("Tape le code affiché sur le site", RED) return end
	start(code)
end)
local saved = plugin:GetSetting("llmms_code") or (#EMBED >= 6 and EMBED or nil)
if saved and #saved >= 6 then start(saved) end
