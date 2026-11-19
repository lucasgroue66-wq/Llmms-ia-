// Kit llmms : modules Luau de référence que l'IA réutilise / adapte (llmms ia 5 en Roblox Studio).
export const KIT = String.raw`Kit llmms — bibliothèque maison. Quand la demande touche à la sauvegarde, aux Remotes, à l'UI ou aux cinématiques, réutilise ces modules (copie-les tels quels ou adapte-les) au lieu de tout réinventer. Mets-les aux emplacements indiqués.

--- ServerScriptService/Services/DataService (ModuleScript) ---
` + "```lua" + String.raw`
-- Kit llmms : sauvegarde joueur fiable (verrou de session, sauvegarde auto, BindToClose)
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")

local STORE_NAME = "PlayerData_v1"
local AUTOSAVE_SECONDS = 90
local LOCK_EXPIRE = 1800
local SESSION_ID = HttpService:GenerateGUID(false)

local DEFAULT_DATA = {
	Coins = 0,
	Rebirths = 0,
	Inventory = {},
}
local LEADERSTATS = { "Coins", "Rebirths" }

local store = DataStoreService:GetDataStore(STORE_NAME)
local profiles: { [Player]: any } = {}
local loadedEvent = Instance.new("BindableEvent")

local DataService = {}
DataService.ProfileLoaded = loadedEvent.Event

local function deepCopy(t)
	local copy = {}
	for k, v in t do
		copy[k] = if type(v) == "table" then deepCopy(v) else v
	end
	return copy
end

local function reconcile(data, template)
	for k, v in template do
		if data[k] == nil then
			data[k] = if type(v) == "table" then deepCopy(v) else v
		elseif type(v) == "table" and type(data[k]) == "table" then
			reconcile(data[k], v)
		end
	end
end

local function keyOf(player: Player): string
	return "u_" .. player.UserId
end

local function loadProfile(player: Player)
	for attempt = 1, 6 do
		local data, locked
		local ok, err = pcall(function()
			store:UpdateAsync(keyOf(player), function(old)
				old = old or { Data = deepCopy(DEFAULT_DATA) }
				local lock = old.Lock
				if lock and lock.Id ~= SESSION_ID and os.time() - lock.Time < LOCK_EXPIRE and attempt < 6 then
					locked = true
					return nil -- un autre serveur tient encore les données : on réessaie
				end
				old.Lock = { Id = SESSION_ID, Time = os.time() }
				data = old.Data
				return old
			end)
		end)
		if ok and data then
			return data
		end
		if not ok then
			warn("[DataService] chargement", player.Name, err)
		end
		task.wait(if locked then 6 else 2 ^ attempt)
	end
	return nil
end

local function saveProfile(player: Player, release: boolean)
	local data = profiles[player]
	if not data then
		return
	end
	for attempt = 1, 3 do
		local ok, err = pcall(function()
			store:UpdateAsync(keyOf(player), function(old)
				old = old or {}
				if old.Lock and old.Lock.Id ~= SESSION_ID then
					return nil -- un autre serveur a pris la main : on n'écrase rien
				end
				old.Data = data
				old.Lock = if release then nil else { Id = SESSION_ID, Time = os.time() }
				return old
			end)
		end)
		if ok then
			return
		end
		warn("[DataService] sauvegarde", player.Name, err)
		task.wait(2 ^ attempt)
	end
end

local function buildLeaderstats(player: Player, data)
	local folder = Instance.new("Folder")
	folder.Name = "leaderstats"
	for _, stat in LEADERSTATS do
		local value = Instance.new("IntValue")
		value.Name = stat
		value.Value = data[stat] or 0
		value.Parent = folder
	end
	folder.Parent = player
end

local function onPlayerAdded(player: Player)
	local data = loadProfile(player)
	if not data then
		player:Kick("Impossible de charger tes données, reconnecte-toi.")
		return
	end
	if not player.Parent then
		return -- le joueur est parti pendant le chargement
	end
	reconcile(data, DEFAULT_DATA)
	profiles[player] = data
	buildLeaderstats(player, data)
	loadedEvent:Fire(player, data)
end

function DataService:Get(player: Player)
	return profiles[player]
end

function DataService:WaitFor(player: Player, timeout: number?)
	local deadline = os.clock() + (timeout or 30)
	while not profiles[player] and player.Parent and os.clock() < deadline do
		task.wait(0.1)
	end
	return profiles[player]
end

function DataService:Increment(player: Player, key: string, amount: number)
	local data = profiles[player]
	if not data or type(amount) ~= "number" or amount ~= amount then
		return nil
	end
	data[key] = (data[key] or 0) + amount
	local stats = player:FindFirstChild("leaderstats")
	local value = stats and stats:FindFirstChild(key)
	if value then
		value.Value = data[key]
	end
	return data[key]
end

function DataService:Start()
	Players.PlayerAdded:Connect(onPlayerAdded)
	for _, player in Players:GetPlayers() do
		task.spawn(onPlayerAdded, player)
	end
	Players.PlayerRemoving:Connect(function(player)
		saveProfile(player, true)
		profiles[player] = nil
	end)
	task.spawn(function()
		while true do
			task.wait(AUTOSAVE_SECONDS)
			for player in profiles do
				task.spawn(saveProfile, player, false)
			end
		end
	end)
	game:BindToClose(function()
		local pending = 0
		for player in profiles do
			pending += 1
			task.spawn(function()
				saveProfile(player, true)
				pending -= 1
			end)
		end
		local deadline = os.clock() + 25
		while pending > 0 and os.clock() < deadline do
			task.wait(0.1)
		end
	end)
end

return DataService
` + "```" + String.raw`

--- ReplicatedStorage/Shared/Net (ModuleScript) ---
` + "```lua" + String.raw`
-- Kit llmms : Remotes centralisés + validation et anti-spam côté serveur
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local IS_SERVER = RunService:IsServer()
local folder: Folder
if IS_SERVER then
	folder = ReplicatedStorage:FindFirstChild("Remotes") :: Folder
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "Remotes"
		folder.Parent = ReplicatedStorage
	end
else
	folder = ReplicatedStorage:WaitForChild("Remotes") :: Folder
end

local Net = {}

local function get(name: string, className: string): Instance
	local remote = folder:FindFirstChild(name)
	if not remote then
		if IS_SERVER then
			remote = Instance.new(className)
			remote.Name = name
			remote.Parent = folder
		else
			remote = folder:WaitForChild(name, 15)
			assert(remote, "Remote introuvable : " .. name)
		end
	end
	return remote :: Instance
end

function Net.Event(name: string): RemoteEvent
	return get(name, "RemoteEvent") :: RemoteEvent
end

function Net.Function(name: string): RemoteFunction
	return get(name, "RemoteFunction") :: RemoteFunction
end

local function valid(args, types): boolean
	if args.n ~= #types then
		return false
	end
	for i, expected in types do
		local v = args[i]
		if typeof(v) ~= expected then
			return false
		end
		if expected == "number" and (v ~= v or math.abs(v) == math.huge) then
			return false
		end
		if expected == "string" and #v > 200 then
			return false
		end
	end
	return true
end

-- Serveur : Net.On("BuyItem", { rate = 5, types = { "string" } }, function(player, itemId) ... end)
function Net.On(name: string, opts: { rate: number?, types: { string }? }, handler: (Player, ...any) -> ())
	assert(IS_SERVER, "Net.On est réservé au serveur")
	local remote = Net.Event(name)
	local rate = opts.rate or 10
	local buckets: { [Player]: { t: number, n: number } } = {}
	Players.PlayerRemoving:Connect(function(player)
		buckets[player] = nil
	end)
	return remote.OnServerEvent:Connect(function(player, ...)
		local now = os.clock()
		local bucket = buckets[player]
		if not bucket or now - bucket.t >= 1 then
			bucket = { t = now, n = 0 }
			buckets[player] = bucket
		end
		bucket.n += 1
		if bucket.n > rate then
			return
		end
		local args = table.pack(...)
		if opts.types and not valid(args, opts.types) then
			return
		end
		handler(player, table.unpack(args, 1, args.n))
	end)
end

return Net
` + "```" + String.raw`

--- ReplicatedStorage/Shared/UIKit (ModuleScript, utilisé par les LocalScripts) ---
` + "```lua" + String.raw`
-- Kit llmms : thème + composants UI animés (responsive, mobile)
local TweenService = game:GetService("TweenService")

local UIKit = {}
UIKit.Theme = {
	Background = Color3.fromRGB(22, 24, 31),
	Panel = Color3.fromRGB(33, 36, 47),
	Accent = Color3.fromRGB(255, 170, 60),
	Good = Color3.fromRGB(80, 200, 120),
	Text = Color3.fromRGB(246, 246, 250),
	Muted = Color3.fromRGB(160, 166, 182),
	Font = Font.new("rbxasset://fonts/families/BuilderSans.json", Enum.FontWeight.Bold),
	Radius = UDim.new(0, 14),
}

function UIKit.Tween(obj: Instance, seconds: number, props: { [string]: any })
	local tween = TweenService:Create(obj, TweenInfo.new(seconds, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), props)
	tween:Play()
	return tween
end

local function decorate(gui: GuiObject, strokeColor: Color3?)
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UIKit.Theme.Radius
	corner.Parent = gui
	local stroke = Instance.new("UIStroke")
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	stroke.Color = strokeColor or Color3.new(0, 0, 0)
	stroke.Thickness = 2
	stroke.Transparency = 0.2
	stroke.Parent = gui
end

function UIKit.Label(props)
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.FontFace = props.Font or UIKit.Theme.Font
	label.Text = props.Text or ""
	label.TextColor3 = props.Color or UIKit.Theme.Text
	label.TextScaled = true
	label.Size = props.Size or UDim2.fromScale(1, 0.1)
	label.Position = props.Position or UDim2.fromScale(0, 0)
	label.AnchorPoint = props.AnchorPoint or Vector2.zero
	local limit = Instance.new("UITextSizeConstraint")
	limit.MaxTextSize = props.MaxTextSize or 36
	limit.Parent = label
	label.Parent = props.Parent
	return label
end

function UIKit.Button(props)
	local button = Instance.new("TextButton")
	button.AutoButtonColor = false
	button.Text = props.Text or "Bouton"
	button.FontFace = UIKit.Theme.Font
	button.TextScaled = true
	button.TextColor3 = props.TextColor or UIKit.Theme.Text
	button.BackgroundColor3 = props.Color or UIKit.Theme.Accent
	button.Size = props.Size or UDim2.fromScale(0.22, 0.09)
	button.Position = props.Position or UDim2.fromScale(0.5, 0.5)
	button.AnchorPoint = props.AnchorPoint or Vector2.new(0.5, 0.5)
	decorate(button)
	local gradient = Instance.new("UIGradient")
	gradient.Color = ColorSequence.new(Color3.new(1, 1, 1), Color3.fromRGB(200, 200, 200))
	gradient.Rotation = 90
	gradient.Parent = button
	local padding = Instance.new("UIPadding")
	padding.PaddingTop = UDim.new(0.18, 0)
	padding.PaddingBottom = UDim.new(0.18, 0)
	padding.PaddingLeft = UDim.new(0.08, 0)
	padding.PaddingRight = UDim.new(0.08, 0)
	padding.Parent = button
	local limit = Instance.new("UITextSizeConstraint")
	limit.MaxTextSize = 32
	limit.Parent = button
	local scale = Instance.new("UIScale")
	scale.Parent = button
	local hovering = false
	button.MouseEnter:Connect(function()
		hovering = true
		UIKit.Tween(scale, 0.15, { Scale = 1.06 })
	end)
	button.MouseLeave:Connect(function()
		hovering = false
		UIKit.Tween(scale, 0.15, { Scale = 1 })
	end)
	button.MouseButton1Down:Connect(function()
		UIKit.Tween(scale, 0.08, { Scale = 0.93 })
	end)
	button.MouseButton1Up:Connect(function()
		UIKit.Tween(scale, 0.12, { Scale = if hovering then 1.06 else 1 })
	end)
	if props.OnClick then
		button.Activated:Connect(props.OnClick)
	end
	button.Parent = props.Parent
	return button
end

-- Fenêtre animée : local win = UIKit.Window({ Title = "Shop", Parent = screenGui }) ; win.Open() ; win.Close()
function UIKit.Window(props)
	local frame = Instance.new("Frame")
	frame.Name = props.Name or "Window"
	frame.AnchorPoint = Vector2.new(0.5, 0.5)
	frame.Position = UDim2.fromScale(0.5, 0.5)
	frame.Size = props.Size or UDim2.fromScale(0.5, 0.6)
	frame.BackgroundColor3 = UIKit.Theme.Panel
	frame.Visible = false
	decorate(frame, UIKit.Theme.Accent)
	local ratio = Instance.new("UIAspectRatioConstraint")
	ratio.AspectRatio = props.AspectRatio or 1.5
	ratio.Parent = frame
	local scale = Instance.new("UIScale")
	scale.Scale = 0
	scale.Parent = frame
	UIKit.Label({ Text = props.Title or "", Parent = frame, Size = UDim2.fromScale(0.8, 0.12), Position = UDim2.fromScale(0.05, 0.03), MaxTextSize = 40 })
	local window = { Frame = frame }
	function window.Open()
		frame.Visible = true
		UIKit.Tween(scale, 0.3, { Scale = 1 })
	end
	function window.Close()
		UIKit.Tween(scale, 0.2, { Scale = 0 }).Completed:Once(function()
			if scale.Scale == 0 then
				frame.Visible = false
			end
		end)
	end
	UIKit.Button({ Text = "X", Parent = frame, Color = Color3.fromRGB(230, 70, 70), Size = UDim2.fromScale(0.09, 0.12), Position = UDim2.fromScale(0.96, 0.04), AnchorPoint = Vector2.new(1, 0), OnClick = window.Close })
	frame.Parent = props.Parent
	return window
end

-- Notification en haut de l'écran : UIKit.Notify(screenGui, "+100 coins", UIKit.Theme.Good)
function UIKit.Notify(parent: Instance, text: string, color: Color3?)
	local toast = Instance.new("Frame")
	toast.AnchorPoint = Vector2.new(0.5, 0)
	toast.Position = UDim2.fromScale(0.5, -0.12)
	toast.Size = UDim2.fromScale(0.32, 0.07)
	toast.BackgroundColor3 = color or UIKit.Theme.Panel
	decorate(toast)
	UIKit.Label({ Text = text, Parent = toast, Size = UDim2.fromScale(0.9, 0.7), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5) })
	toast.Parent = parent
	UIKit.Tween(toast, 0.35, { Position = UDim2.fromScale(0.5, 0.03) })
	task.delay(2.5, function()
		UIKit.Tween(toast, 0.3, { Position = UDim2.fromScale(0.5, -0.12) }).Completed:Once(function()
			toast:Destroy()
		end)
	end)
end

return UIKit
` + "```" + String.raw`

--- ReplicatedStorage/Shared/Cinematic (ModuleScript, à utiliser depuis un LocalScript) ---
` + "```lua" + String.raw`
-- Kit llmms : cinématiques (caméra, bandes noires, fondus, titres, sous-titres, flou, tremblement, bouton Passer)
-- Exemple (LocalScript) :
--   local Cinematic = require(game.ReplicatedStorage.Shared.Cinematic)
--   local cine = Cinematic.new()
--   cine:Play({
--   	function(c) c:Letterbox(true) c:FadeTo(1, 0) c:FadeTo(0, 1.5) end,
--   	function(c) c:Shot({ From = CFrame.new(0, 80, 200), To = CFrame.new(0, 40, 60), Focus = Vector3.new(0, 20, 0), Duration = 6, FovFrom = 50, FovTo = 40 }) end,
--   	function(c) c:Say("Bienvenue à Vice Beach.", 2.5) end,
--   	function(c) c:Shot({ From = CFrame.new(-60, 6, 20), To = CFrame.new(60, 6, 20), Focus = Vector3.new(0, 5, 0), Duration = 5, Shake = 0.6 }) end,
--   	function(c) c:FadeTo(1, 0.8) c:ShowTitle("CHAPITRE 1", 2.5) end,
--   })
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")

local Cinematic = {}
Cinematic.__index = Cinematic

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera

local function tween(obj, seconds, props, style)
	local tw = TweenService:Create(obj, TweenInfo.new(seconds, style or Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), props)
	tw:Play()
	return tw
end

local function label(parent, size, position, textSize)
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Size = size
	l.Position = position
	l.AnchorPoint = Vector2.new(0.5, 0.5)
	l.FontFace = Font.new("rbxasset://fonts/families/BuilderSans.json", Enum.FontWeight.Heavy)
	l.TextColor3 = Color3.new(1, 1, 1)
	l.TextTransparency = 1
	l.TextStrokeTransparency = 1
	l.TextScaled = true
	l.Text = ""
	l.ZIndex = 20
	local limit = Instance.new("UITextSizeConstraint")
	limit.MaxTextSize = textSize
	limit.Parent = l
	l.Parent = parent
	return l
end

function Cinematic.new()
	local self = setmetatable({}, Cinematic)
	local gui = Instance.new("ScreenGui")
	gui.Name = "Cinematic"
	gui.IgnoreGuiInset = true
	gui.ResetOnSpawn = false
	gui.DisplayOrder = 100
	local function bar(anchorY)
		local f = Instance.new("Frame")
		f.BackgroundColor3 = Color3.new(0, 0, 0)
		f.BorderSizePixel = 0
		f.AnchorPoint = Vector2.new(0, anchorY)
		f.Position = UDim2.fromScale(0, anchorY)
		f.Size = UDim2.fromScale(1, 0)
		f.ZIndex = 15
		f.Parent = gui
		return f
	end
	self.Top = bar(0)
	self.Bottom = bar(1)
	local fade = Instance.new("Frame")
	fade.Size = UDim2.fromScale(1, 1)
	fade.BackgroundColor3 = Color3.new(0, 0, 0)
	fade.BackgroundTransparency = 1
	fade.BorderSizePixel = 0
	fade.ZIndex = 10
	fade.Parent = gui
	self.Fade = fade
	self.Title = label(gui, UDim2.fromScale(0.8, 0.14), UDim2.fromScale(0.5, 0.5), 90)
	self.Subtitle = label(gui, UDim2.fromScale(0.8, 0.06), UDim2.fromScale(0.5, 0.82), 34)
	local skip = Instance.new("TextButton")
	skip.Text = "Passer ▸"
	skip.FontFace = Font.new("rbxasset://fonts/families/BuilderSans.json", Enum.FontWeight.Bold)
	skip.TextScaled = true
	skip.TextColor3 = Color3.new(1, 1, 1)
	skip.BackgroundColor3 = Color3.new(0, 0, 0)
	skip.BackgroundTransparency = 0.4
	skip.AnchorPoint = Vector2.new(1, 0)
	skip.Position = UDim2.fromScale(0.97, 0.03)
	skip.Size = UDim2.fromScale(0.12, 0.05)
	skip.ZIndex = 30
	skip.Visible = false
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0.3, 0)
	corner.Parent = skip
	skip.Parent = gui
	self.Skip = skip
	self.skipped = false
	skip.Activated:Connect(function()
		self.skipped = true
	end)
	self.Blur = Instance.new("BlurEffect")
	self.Blur.Size = 0
	self.Blur.Parent = Lighting
	self.Color = Instance.new("ColorCorrectionEffect")
	self.Color.Parent = Lighting
	gui.Parent = player:WaitForChild("PlayerGui")
	self.Gui = gui
	return self
end

-- Attente interrompue par « Passer »
function Cinematic:Wait(seconds: number)
	local t0 = os.clock()
	while os.clock() - t0 < seconds and not self.skipped do
		task.wait()
	end
end

function Cinematic:Letterbox(on: boolean, seconds: number?)
	local h = if on then 0.11 else 0
	tween(self.Top, seconds or 0.7, { Size = UDim2.fromScale(1, h) })
	tween(self.Bottom, seconds or 0.7, { Size = UDim2.fromScale(1, h) })
end

-- amount : 1 = écran noir, 0 = image visible
function Cinematic:FadeTo(amount: number, seconds: number?)
	if (seconds or 0.8) <= 0 then
		self.Fade.BackgroundTransparency = 1 - amount
		return
	end
	tween(self.Fade, seconds or 0.8, { BackgroundTransparency = 1 - amount })
	self:Wait(seconds or 0.8)
end

function Cinematic:ShowTitle(text: string, hold: number?)
	self.Title.Text = text
	tween(self.Title, 0.6, { TextTransparency = 0, TextStrokeTransparency = 0.6 })
	self:Wait(0.6 + (hold or 2))
	tween(self.Title, 0.6, { TextTransparency = 1, TextStrokeTransparency = 1 })
	self:Wait(0.6)
end

function Cinematic:Say(text: string, hold: number?)
	self.Subtitle.Text = text
	tween(self.Subtitle, 0.3, { TextTransparency = 0, TextStrokeTransparency = 0.5 })
	self:Wait(0.3 + (hold or 2))
	tween(self.Subtitle, 0.3, { TextTransparency = 1, TextStrokeTransparency = 1 })
end

-- Ambiance : Grade({ Saturation = 0.2, Contrast = 0.15, TintColor = Color3.fromRGB(255, 220, 200) }, 1)
function Cinematic:Grade(props, seconds: number?)
	tween(self.Color, seconds or 1, props)
end

function Cinematic:BlurTo(size: number, seconds: number?)
	tween(self.Blur, seconds or 0.5, { Size = size })
end

-- Plan caméra : { From, To (CFrame), Control (Vector3, courbe), Focus (Vector3, regarde vers), Duration, FovFrom, FovTo, Shake, Style }
function Cinematic:Shot(shot)
	camera.CameraType = Enum.CameraType.Scriptable
	local t0 = os.clock()
	local duration = math.max(shot.Duration or 3, 0.05)
	while not self.skipped do
		local a = math.clamp((os.clock() - t0) / duration, 0, 1)
		local e = TweenService:GetValue(a, shot.Style or Enum.EasingStyle.Sine, Enum.EasingDirection.InOut)
		local p0, p2 = shot.From.Position, shot.To.Position
		local pos = if shot.Control
			then (1 - e) ^ 2 * p0 + 2 * (1 - e) * e * shot.Control + e ^ 2 * p2
			else p0:Lerp(p2, e)
		local cf = if shot.Focus
			then CFrame.lookAt(pos, shot.Focus)
			else CFrame.new(pos) * shot.From.Rotation:Lerp(shot.To.Rotation, e)
		if shot.Shake then
			local t = os.clock() * 9
			cf *= CFrame.Angles(math.rad(math.noise(t, 0.3) * shot.Shake), math.rad(math.noise(0.7, t) * shot.Shake), 0)
		end
		camera.CFrame = cf
		if shot.FovFrom then
			camera.FieldOfView = shot.FovFrom + ((shot.FovTo or shot.FovFrom) - shot.FovFrom) * e
		end
		if a >= 1 then
			break
		end
		RunService.RenderStepped:Wait()
	end
end

function Cinematic:Stop()
	camera.CameraType = Enum.CameraType.Custom
	camera.FieldOfView = 70
	self:Letterbox(false, 0.4)
	tween(self.Fade, 0.4, { BackgroundTransparency = 1 })
	self.Title.TextTransparency = 1
	self.Subtitle.TextTransparency = 1
	self.Skip.Visible = false
	tween(self.Blur, 0.3, { Size = 0 })
	tween(self.Color, 0.5, { Saturation = 0, Contrast = 0, Brightness = 0, TintColor = Color3.new(1, 1, 1) })
end

-- Joue une liste d'étapes (fonctions qui reçoivent la cinématique), puis rend la caméra au joueur
function Cinematic:Play(steps)
	self.skipped = false
	self.Skip.Visible = true
	for _, step in steps do
		if self.skipped then
			break
		end
		local ok, err = pcall(step, self)
		if not ok then
			warn("[Cinematic]", err)
		end
	end
	self:Stop()
end

return Cinematic
` + "```";
