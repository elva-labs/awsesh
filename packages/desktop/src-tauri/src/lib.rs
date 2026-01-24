#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    image::Image,
    window::WindowBuilder,
    App, AppHandle, Builder, Manager, Runtime, WindowUrl,
};

pub fn run() {
    let app = Builder::default()
        .setup(|app| {
            let window = WindowBuilder::new(
                app,
                "main",
                WindowUrl::App("index.html".into()),
            )
            .title("AWSESH")
            .inner_size(800.0, 600.0)
            .resizable(true)
            .fullscreen(false)
            .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|_app_handle, _event| {});
}
