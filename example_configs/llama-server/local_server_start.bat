@echo off
TITLE Local Neural Router - llama-server
echo [SYSTEM] Initializing Surgical Neural Router...
echo [SYSTEM] Loading Presets from models_config.ini.txt
echo [SYSTEM] VRAM Safety Lock: --models-max 1 (Unloads previous model on swap)

.\llama-server.exe --models-preset ./models_config.ini --jinja --models-max 1

pause