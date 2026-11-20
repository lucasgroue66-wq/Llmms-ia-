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

local LogService = game:GetService("LogService")
local function getOutput(n)
	n = math.clamp(tonumber(n) or 60, 5, 200)
	local h, out = LogService:GetLogHistory(), {}
	for i = math.max(1, #h - n + 1), #h do
		local e = h[i]; local tag = e.messageType == Enum.MessageType.MessageError and "❌" or e.messageType == Enum.MessageType.MessageWarning and "⚠" or "•"
		table.insert(out, tag .. " " .. e.message)
	end
	return #out > 0 and table.concat(out, "\n") or "Console vide", false
end
local function getProps(path)
	local o = resolve(path); if not o then return "Introuvable : " .. tostring(path), true end
	local out = { o:GetFullName() .. " [" .. o.ClassName .. "]" }
	for _, p in ipairs({ "Position", "Size", "Color", "BrickColor", "Material", "Transparency", "Anchored", "CanCollide", "Text", "TextColor3", "BackgroundColor3", "Visible", "Enabled", "Value", "Disabled" }) do
		local ok, v = pcall(function() return o[p] end)
		if ok and v ~= nil then table.insert(out, p .. " = " .. tostring(v)) end
	end
	table.insert(out, "Enfants : " .. #o:GetChildren())
	return table.concat(out, "\n"), false
end
-- 🧪 MODE TESTEUR : lance une vraie partie de test (Play), récupère les erreurs serveur + client, vérifie le joueur, puis arrête
local STS = game:GetService("StudioTestService")
local function playtest(seconds, checks)
	seconds = math.clamp(tonumber(seconds) or 8, 3, 30)
	local RS, SSS, SPS = game:GetService("ReplicatedStorage"), game:GetService("ServerScriptService"), game:GetService("StarterPlayer"):FindFirstChildOfClass("StarterPlayerScripts")
	local remote = Instance.new("RemoteEvent"); remote.Name = "__llmms_log"; remote.Parent = RS
	local server = Instance.new("Script"); server.Name = "__llmms_testeur"
	server.Source = [[
local STS = game:GetService("StudioTestService")
local LogService, Players = game:GetService("LogService"), game:GetService("Players")
local remote = game:GetService("ReplicatedStorage"):WaitForChild("__llmms_log")
local logs, seen = {}, {}
local function add(tag, m) if m:find("__llmms") then return end local k = tag .. m if not seen[k] then seen[k] = true; table.insert(logs, tag .. " " .. m) end end
LogService.MessageOut:Connect(function(m, t) if t == Enum.MessageType.MessageError then add("❌ [serveur]", m) elseif t == Enum.MessageType.MessageWarning then add("⚠ [serveur]", m) end end)
remote.OnServerEvent:Connect(function(_, tag, m) add(tag, tostring(m)) end)
task.wait(]] .. seconds .. [[)
local r = { "🧪 Test de " .. ]] .. seconds .. [[ .. " s terminé" }
local p = Players:GetPlayers()[1]
if p then
	local ch = p.Character
	table.insert(r, ch and ch:FindFirstChildOfClass("Humanoid") and ("✓ Personnage OK (vie " .. math.floor(ch.Humanoid.Health) .. ")") or "❌ Le joueur n'a pas de personnage")
	local ls = p:FindFirstChild("leaderstats"); if ls then local t = {} for _, v in ipairs(ls:GetChildren()) do table.insert(t, v.Name .. "=" .. tostring(v.Value)) end table.insert(r, "✓ leaderstats : " .. table.concat(t, ", ")) end
	local gui = {} for _, g in ipairs(p.PlayerGui:GetChildren()) do if g:IsA("ScreenGui") then table.insert(gui, g.Name) end end
	table.insert(r, "Interfaces affichées : " .. (#gui > 0 and table.concat(gui, ", ") or "aucune"))
else table.insert(r, "⚠ Aucun joueur dans le test") end
local extraOk, extra = pcall(function()
]] .. (checks or "") .. [[

end)
if not extraOk then table.insert(r, "❌ Vérification personnalisée : " .. tostring(extra)) elseif extra ~= nil then table.insert(r, "Vérification : " .. tostring(extra)) end
table.insert(r, #logs == 0 and "✅ Aucune erreur dans la console" or ("Erreurs / avertissements (" .. #logs .. ") :\n" .. table.concat(logs, "\n")))
-- 📸 PHOTOS DU TEST : on « photographie » le jeu avec des rayons depuis une caméra (comme un appareil photo)
local photos = {}
pcall(function()
	local HS, Lighting = game:GetService("HttpService"), game:GetService("Lighting")
	local W, H = 192, 108
	local sun = Lighting:GetSunDirection(); if sun.Y < 0.2 then sun = Vector3.new(0.4, 0.8, 0.3).Unit end
	local SKY1, SKY2 = Color3.fromRGB(120, 175, 235), Color3.fromRGB(205, 225, 245)
	local function hex(c) return string.format("%x%x%x", math.clamp(math.floor(c.R * 15 + 0.5), 0, 15), math.clamp(math.floor(c.G * 15 + 0.5), 0, 15), math.clamp(math.floor(c.B * 15 + 0.5), 0, 15)) end
	local function colorOf(hit)
		if hit.Instance:IsA("Terrain") then
			if hit.Material == Enum.Material.Water then return workspace.Terrain.WaterColor end
			local ok, c = pcall(function() return workspace.Terrain:GetMaterialColor(hit.Material) end)
			return ok and c or Color3.fromRGB(90, 140, 70)
		end
		return hit.Instance.Color
	end
	local function shoot(name, cam, fov)
		local params = RaycastParams.new(); params.FilterType = Enum.RaycastFilterType.Exclude
		local skip = {}; params.FilterDescendantsInstances = skip
		local tY = math.tan(math.rad(fov / 2)); local tX = tY * W / H
		local out = table.create(W * H)
		for y = 0, H - 1 do
			for x = 0, W - 1 do
				local u, v = ((x + 0.5) / W * 2 - 1) * tX, (1 - (y + 0.5) / H * 2) * tY
				local dir = (cam.LookVector + cam.RightVector * u + cam.UpVector * v).Unit * 2000
				local hit
				for _ = 1, 4 do
					hit = workspace:Raycast(cam.Position, dir, params)
					if hit and hit.Instance:IsA("BasePart") and hit.Instance.Transparency > 0.9 then table.insert(skip, hit.Instance); params.FilterDescendantsInstances = skip; hit = nil else break end
				end
				local col
				if hit then
					local c = colorOf(hit)
					local l = 0.5 + 0.5 * math.max(0, hit.Normal:Dot(sun))
					c = Color3.new(c.R * l, c.G * l, c.B * l)
					col = c:Lerp(SKY2, math.clamp((hit.Distance - 250) / 900, 0, 0.85))
				else
					col = SKY1:Lerp(SKY2, math.clamp(1 - v / tY, 0, 1) * 0.8)
				end
				out[#out + 1] = hex(col)
			end
			if y % 12 == 0 then task.wait() end
		end
		table.insert(photos, { name = name, d = table.concat(out) })
	end
	local pl = Players:GetPlayers()[1]
	local root = pl and pl.Character and pl.Character:FindFirstChild("HumanoidRootPart")
	if root then
		local pos = (root.CFrame * CFrame.new(0, 4.5, 13)).Position
		shoot("Vue du joueur", CFrame.lookAt(pos, root.Position + Vector3.new(0, 2, 0)), 70)
	end
	local parts = {}
	for _, o in ipairs(workspace:GetDescendants()) do if o:IsA("BasePart") and not o:IsA("Terrain") and o.Size.Magnitude < 400 and o.Transparency < 0.9 then table.insert(parts, o.Position) end end
	if #parts > 0 then
		local mn, mx = parts[1], parts[1]
		for _, p in ipairs(parts) do mn = mn:Min(p); mx = mx:Max(p) end
		local c, size = (mn + mx) / 2, (mx - mn).Magnitude
		local d = math.clamp(size * 0.75, 40, 600)
		shoot("Vue d'ensemble", CFrame.lookAt(c + Vector3.new(d * 0.55, d * 0.6, d * 0.55), c), 60)
	end
	if #photos > 0 then table.insert(r, "@@PHOTOS@@" .. HS:JSONEncode({ w = W, h = H, shots = photos })) end
end)
STS:EndTest(table.concat(r, "\n"))
]]
	server.Parent = SSS
	local client = Instance.new("LocalScript"); client.Name = "__llmms_testeur_client"
	client.Source = [[
local remote = game:GetService("ReplicatedStorage"):WaitForChild("__llmms_log")
game:GetService("LogService").MessageOut:Connect(function(m, t)
	if m:find("__llmms") then return end
	if t == Enum.MessageType.MessageError then remote:FireServer("❌ [client]", m) elseif t == Enum.MessageType.MessageWarning then remote:FireServer("⚠ [client]", m) end
end)
]]
	client.Parent = SPS
	local ok, res = pcall(function() return STS:ExecutePlayModeAsync({}) end)
	for _, o in ipairs({ remote, server, client }) do pcall(function() o:Destroy() end) end
	if not ok then return "Impossible de lancer le test : " .. tostring(res) .. " (arrête le test en cours dans Studio si besoin)", true end
	return tostring(res), false
end
-- 📸 Photo de la place : position, taille, orientation et couleur des pièces visibles (le site dessine l'image 3D)
local function snapshot(max)
	max = math.clamp(tonumber(max) or 2500, 50, 4000)
	local list = {}
	for _, o in ipairs(workspace:GetDescendants()) do
		if o:IsA("BasePart") and not o:IsA("Terrain") and o.Transparency < 0.95 then local z = o.Size; table.insert(list, { o, z.X * z.Y * z.Z }) end
	end
	table.sort(list, function(a, b) return a[2] > b[2] end)
	local r = function(v, m) return math.floor(v * m + 0.5) / m end
	local out = {}
	for i = 1, math.min(max, #list) do
		local p = list[i][1]; local cf, z, c = p.CFrame, p.Size, p.Color
		local R, U = cf.RightVector, cf.UpVector
		local shape = (p:IsA("Part") and p.Shape == Enum.PartType.Ball) and 1 or (p:IsA("Part") and p.Shape == Enum.PartType.Cylinder) and 2 or 0
		table.insert(out, { r(p.Position.X, 10), r(p.Position.Y, 10), r(p.Position.Z, 10), r(z.X, 10), r(z.Y, 10), r(z.Z, 10), r(R.X, 100), r(R.Y, 100), r(R.Z, 100), r(U.X, 100), r(U.Y, 100), r(U.Z, 100), math.floor(c.R * 255) * 65536 + math.floor(c.G * 255) * 256 + math.floor(c.B * 255), r(p.Transparency, 10), shape })
	end
	return HttpService:JSONEncode({ parts = out, total = #list, place = game.Name }), false
end
local TOOLS = {
	snapshot = function(a) return snapshot(a.max) end,
	playtest = function(a) return playtest(a.seconds, a.checks) end,
	get_output = function(a) return getOutput(a.lines) end,
	get_properties = function(a) return getProps(a.path) end,
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
