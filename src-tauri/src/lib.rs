use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, RunEvent,
};

// ── Config ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct AppConfig {
    #[serde(default = "default_version")]
    version: String,
    #[serde(default)]
    data_dir: Option<String>,
    #[serde(default)]
    encryption_key: Option<String>,
    #[serde(default)]
    sidecar_port: u16,
    #[serde(default = "default_theme")]
    theme: String,
    #[serde(default = "default_language")]
    language: String,
    #[serde(default)]
    auto_start: bool,
    #[serde(default)]
    minimize_to_tray: bool,
    #[serde(default)]
    first_run_completed: bool,
}

fn default_version() -> String { "0.2.0".into() }
fn default_theme() -> String { "dark".into() }
fn default_language() -> String { "zh-CN".into() }

/// Partial update struct for set_config IPC — all fields optional
/// so the frontend can send Partial<AppConfig> without deserialization errors.
#[derive(Debug, Deserialize, Default)]
#[allow(dead_code)]
struct AppConfigUpdate {
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    data_dir: Option<String>,
    #[serde(default)]
    encryption_key: Option<String>,
    #[serde(default)]
    sidecar_port: Option<u16>,
    #[serde(default)]
    theme: Option<String>,
    #[serde(default)]
    language: Option<String>,
    #[serde(default)]
    auto_start: Option<bool>,
    #[serde(default)]
    minimize_to_tray: Option<bool>,
    #[serde(default)]
    first_run_completed: Option<bool>,
}

struct AppState {
    config: Mutex<AppConfig>,
    config_path: PathBuf,
    sidecar_child: Mutex<Option<Child>>,
}

fn get_config_path() -> PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("polyrader-cs2");
    fs::create_dir_all(&config_dir).ok();
    config_dir.join("config.json")
}

fn load_config(path: &PathBuf) -> AppConfig {
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

fn save_config(path: &PathBuf, config: &AppConfig) {
    if let Ok(json) = serde_json::to_string_pretty(config) {
        fs::write(path, json).ok();
    }
}

fn generate_encryption_key() -> String {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use rand::RngCore;
    let mut key = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut key);
    STANDARD.encode(key)
}

// ── IPC Commands ───────────────────────────────────────────────

#[tauri::command]
fn get_sidecar_port(state: tauri::State<AppState>) -> u16 {
    state.config.lock().unwrap_or_else(|e| e.into_inner()).sidecar_port
}

#[tauri::command]
fn get_config(state: tauri::State<AppState>) -> AppConfig {
    state.config.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
fn set_config(state: tauri::State<AppState>, updates: AppConfigUpdate) -> AppConfig {
    let mut config = state.config.lock().unwrap_or_else(|e| e.into_inner());
    // Only update fields that were explicitly provided
    if let Some(dir) = updates.data_dir {
        config.data_dir = Some(dir);
    }
    if let Some(theme) = updates.theme {
        if !theme.is_empty() {
            config.theme = theme;
        }
    }
    if let Some(language) = updates.language {
        if !language.is_empty() {
            config.language = language;
        }
    }
    if let Some(auto_start) = updates.auto_start {
        config.auto_start = auto_start;
    }
    if let Some(minimize_to_tray) = updates.minimize_to_tray {
        config.minimize_to_tray = minimize_to_tray;
    }
    if let Some(first_run_completed) = updates.first_run_completed {
        config.first_run_completed = first_run_completed;
    }
    save_config(&state.config_path, &config);
    config.clone()
}

#[tauri::command]
fn set_data_dir(state: tauri::State<AppState>, app: tauri::AppHandle, dir: String) -> AppConfig {
    let mut config = state.config.lock().unwrap_or_else(|e| e.into_inner());
    config.data_dir = Some(dir.clone());
    if config.encryption_key.is_none() {
        config.encryption_key = Some(generate_encryption_key());
    }
    config.first_run_completed = true;
    save_config(&state.config_path, &config);
    let config_clone = config.clone();
    drop(config); // Release lock before starting sidecar

    // Stop any existing sidecar before starting a new one
    stop_sidecar(&state);

    // Start sidecar now that we have data_dir and encryption_key
    match start_sidecar(&app) {
        Ok(port) => log::info!("Sidecar started after setup on port {}", port),
        Err(e) => {
            log::error!("Failed to start sidecar after setup: {}", e);
            app.emit("sidecar-error", e).ok();
        }
    }

    config_clone
}

/// Restart the sidecar process (e.g. after changing data directory or encryption key).
#[tauri::command]
fn restart_sidecar(state: tauri::State<AppState>, app: tauri::AppHandle) -> Result<u16, String> {
    stop_sidecar(&state);
    // Reset the sidecar-ready flag on the frontend
    app.emit("sidecar-restarting", ()).ok();
    start_sidecar(&app)
}

// ── Sidecar Management ────────────────────────────────────────

fn start_sidecar(app: &tauri::AppHandle) -> Result<u16, String> {
    let state = app.state::<AppState>();
    let config = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();

    // In dev mode, use a fixed port so Vite proxy can target it.
    // In production, use a random port and the frontend gets it via IPC.
    let port: u16 = if cfg!(debug_assertions) {
        13001
    } else {
        12000 + (rand::random::<u16>() % 1000)
    };

    let data_dir = config.data_dir.clone().unwrap_or_else(|| {
        dirs::document_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("PolyRader")
            .to_string_lossy()
            .to_string()
    });

    let encryption_key = config.encryption_key.clone().unwrap_or_default();

    // In development, use npx tsx to run the server from source.
    // In production, use the bun-compiled standalone binary (shipped as a Tauri resource).
    let mut cmd = if cfg!(debug_assertions) {
        let mut c = Command::new("npx");
        c.args(["tsx", "packages/server/src/index.ts"]);
        c
    } else {
        // Resolve the bundled server binary from Tauri's resource directory
        let resource_path = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?
            .join("polyrader-server");

        if !resource_path.exists() {
            return Err(format!(
                "Bundled server not found at: {:?}. Ensure the build includes server resources.",
                resource_path
            ));
        }

        // The bun-compiled binary is standalone — no Node.js required
         let c = Command::new(&resource_path);
         c
    };

    cmd.arg(format!("--port={}", port))
        .env("POLYRADER_DATA_DIR", &data_dir)
        .env("POLYRADER_ENCRYPTION_KEY", &encryption_key)
        .env("NODE_ENV", if cfg!(debug_assertions) { "development" } else { "production" })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    // Read stdout in background
    if let Some(stdout) = child.stdout.take() {
        let app_handle = app.clone();
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(l) => {
                        log::info!("[sidecar] {}", l);
                        // Parse JSON log to detect server-ready
                        if l.contains("Server running") {
                            app_handle.emit("sidecar-ready", port).ok();
                        }
                    }
                    Err(e) => log::error!("[sidecar stdout error] {}", e),
                }
            }
        });
    }

    // Read stderr in background
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                match line {
                    Ok(l) => log::error!("[sidecar stderr] {}", l),
                    Err(e) => log::error!("[sidecar stderr error] {}", e),
                }
            }
        });
    }

    // Store child handle
    *state.sidecar_child.lock().unwrap_or_else(|e| e.into_inner()) = Some(child);

    // Update port in config
    {
        let mut config = state.config.lock().unwrap_or_else(|e| e.into_inner());
        config.sidecar_port = port;
        save_config(&state.config_path, &config);
    }

    log::info!("Sidecar started on port {}", port);
    Ok(port)
}

fn stop_sidecar(state: &AppState) {
    if let Some(mut child) = state.sidecar_child.lock().unwrap_or_else(|e| e.into_inner()).take() {
        child.kill().ok();
        child.wait().ok();
        log::info!("Sidecar stopped");
    }
}

// ── App Entry ─────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config_path = get_config_path();
    let config = load_config(&config_path);

    let first_run = !config.first_run_completed;

    let state = AppState {
        config: Mutex::new(config),
        config_path: config_path.clone(),
        sidecar_child: Mutex::new(None),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_sidecar_port,
            get_config,
            set_config,
            set_data_dir,
            restart_sidecar,
        ])
        .setup(move |app| {
            // Build tray menu
            let show_item = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let icon = app.default_window_icon().cloned();
            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("PolyRader CS2");
            if let Some(ic) = icon {
                tray_builder = tray_builder.icon(ic);
            }
            let _tray = tray_builder
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                window.show().ok();
                                window.set_focus().ok();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().ok();
                            window.set_focus().ok();
                        }
                    }
                })
                .build(app)?;

            // Only start sidecar if first run is already completed.
            // On first run, the sidecar will be started by set_data_dir after setup.
            if !first_run {
                let app_handle = app.handle().clone();
                match start_sidecar(&app_handle) {
                    Ok(port) => {
                        log::info!("Sidecar started on port {}", port);
                        // Best-effort fallback emit: if stdout parsing misses the
                        // "Server running" line, emit sidecar-ready after a short delay.
                        // The primary detection mechanism is stdout parsing above.
                        let ah = app_handle.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_secs(2));
                            ah.emit("sidecar-ready", port).ok();
                        });
                    }
                    Err(e) => {
                        log::error!("Failed to start sidecar: {}", e);
                        app_handle.emit("sidecar-error", e).ok();
                    }
                }
            } else {
                log::info!("First run not completed — waiting for setup before starting sidecar");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                let config = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();

                if config.minimize_to_tray {
                    window.hide().ok();
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                let state = app.state::<AppState>();
                stop_sidecar(&state);
            }
        });
}
