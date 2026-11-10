# Control Room mod — common tasks. Run `make help` for the list.
# Paths match ControlRoom.csproj; override on the command line, e.g. `make install COI_MODS=/some/dir`.

MOD       := ControlRoom
CONFIG    ?= Release
COI_ROOT  ?= $(HOME)/.local/share/Steam/steamapps/common/Captain of Industry
COI_DATA  ?= $(HOME)/.local/share/Steam/steamapps/compatdata/1594320/pfx/drive_c/users/steamuser/AppData/Roaming/Captain of Industry
COI_MODS  ?= $(COI_DATA)/Mods
COI_LOGS  ?= $(COI_DATA)/Logs
API       ?= http://127.0.0.1:3073
WEB_SRC   := web-src
VERSION   := $(shell sed -nE 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' manifest.json)

DOTNET    := dotnet build $(MOD).csproj -c $(CONFIG) -nologo -v:minimal \
             "-p:COI_ROOT=$(COI_ROOT)" "-p:COI_MODS=$(COI_MODS)"

.DEFAULT_GOAL := help
.PHONY: help deps web dev check build install deploy debug uninstall clean dist routes hello unity power population open log logs

help: ## Show this list
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[1m%-10s\033[0m %s\n", $$1, $$2}'

deps: ## Install the dashboard's node packages (runs by itself when they are missing)
	pnpm --dir $(WEB_SRC) install --frozen-lockfile

$(WEB_SRC)/node_modules:
	$(MAKE) deps

web: | $(WEB_SRC)/node_modules ## Build the dashboard from web-src/ into web/ (served at /control-room/)
	pnpm --dir $(WEB_SRC) exec vite build --base=/control-room/ --outDir "$(CURDIR)/web" --emptyOutDir --logLevel warn

dev: | $(WEB_SRC)/node_modules ## Dashboard dev server with hot reload against the running game (http://localhost:5173)
	pnpm --dir $(WEB_SRC) dev

check: | $(WEB_SRC)/node_modules ## Type-check the dashboard
	pnpm --dir $(WEB_SRC) check

build: web ## Build the dashboard and the mod, without installing
	$(DOTNET) -p:DeployToModsFolder=false

install: web ## Build the dashboard and the mod, copy the mod into the game's Mods folder
	$(DOTNET)

# Staging lives next to the Mods folder (same filesystem, so the swap is a rename) but outside it, so the game never
# picks up a half-copied folder as a mod.
STAGE := $(patsubst %/,%,$(dir $(COI_MODS)))/.$(MOD)-staging

deploy: build ## Build everything, then swap the new mod into the Mods folder in one step (all or nothing)
	@test -d "$(COI_MODS)" || { echo "Mods folder not found: $(COI_MODS)"; exit 1; }
	@rm -rf -- "$(STAGE)" && mkdir -p "$(STAGE)/$(MOD)"
	cp manifest.json "bin/$(CONFIG)/$(MOD).dll" "bin/$(CONFIG)/$(MOD).pdb" "$(STAGE)/$(MOD)/"
	@set -e; new="$(STAGE)/$(MOD)"; dst="$(COI_MODS)/$(MOD)"; \
	if [ ! -e "$$dst" ]; then mv -T -- "$$new" "$$dst"; \
	elif mv --exchange -T -- "$$new" "$$dst" 2>/dev/null; then :; \
	else mv -T -- "$$dst" "$(STAGE)/old" && mv -T -- "$$new" "$$dst"; fi
	@rm -rf -- "$(STAGE)"
	@echo "Deployed $(MOD) $(VERSION) to $(COI_MODS)/$(MOD)"

debug: ## Debug build and install
	$(MAKE) install CONFIG=Debug

uninstall: ## Remove the mod from the game's Mods folder
	@test -n "$(MOD)" && test -d "$(COI_MODS)" || { echo "Mods folder not found: $(COI_MODS)"; exit 1; }
	rm -rf -- "$(COI_MODS)/$(MOD)"

clean: ## Delete build output
	rm -rf bin obj dist web

dist: build ## Make dist/ControlRoom_<version>.zip for sharing (mod folder as the zip root)
	@rm -rf dist && mkdir -p "dist/$(MOD)"
	cp manifest.json "bin/$(CONFIG)/$(MOD).dll" "dist/$(MOD)/"
	cd dist && bsdtar -a -cf "$(MOD)_$(VERSION).zip" "$(MOD)"
	@echo "dist/$(MOD)_$(VERSION).zip"

routes: ## List the game's web API routes (game running, web_api_start)
	@curl -sf "$(API)/routes" || echo "Web API not reachable at $(API). Run web_api_start in the game console."

hello: ## Call the mod's JSON route
	@curl -sf "$(API)/api/mods/control-room/hello" || echo "Route not reachable. Is the mod enabled and web_api_start running?"

unity: ## Call the mod's Unity route (pretty-printed)
	@curl -sf "$(API)/api/mods/control-room/unity" | python3 -m json.tool || echo "Route not reachable. Is the mod enabled and web_api_start running?"

power: ## Call the mod's electricity and computing routes (pretty-printed)
	@curl -sf "$(API)/api/mods/control-room/electricity" | python3 -m json.tool || echo "Route not reachable. Is the mod (new version: restart the game) enabled and web_api_start running?"
	@curl -sf "$(API)/api/mods/control-room/computing" | python3 -m json.tool || true

population: ## Call the mod's population and health route (pretty-printed)
	@curl -sf "$(API)/api/mods/control-room/population" | python3 -m json.tool || echo "Route not reachable. Is the mod (new version: restart the game) enabled and web_api_start running?"

open: ## Open the mod's dashboard in the browser
	xdg-open "$(API)/control-room" >/dev/null 2>&1 &

log: ## Show ControlRoom and web API lines from the newest game log (base game alone: "Registered 12 web routes")
	@f=$$(ls -t "$(COI_LOGS)"/*.log 2>/dev/null | head -1); \
	test -n "$$f" || { echo "No logs in $(COI_LOGS)"; exit 1; }; \
	echo "== $$f"; grep -iE 'controlroom|web ?api|web route' "$$f" || echo "(no matching lines)"

logs: ## Follow the newest game log
	@f=$$(ls -t "$(COI_LOGS)"/*.log 2>/dev/null | head -1); \
	test -n "$$f" || { echo "No logs in $(COI_LOGS)"; exit 1; }; \
	tail -n 50 -F "$$f"
