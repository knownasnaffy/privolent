pub mod commands;
pub mod crypto;
pub mod db;
pub mod engine;
pub mod migrations;

use db::DbState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data directory");
            let db_path = app_data_dir.join("loan_collector.db");
            app.manage(DbState::new(db_path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Database lifecycle
            commands::get_db_status,
            commands::unlock_database,
            commands::lock_database,
            // Persons (Customers & Guarantors)
            commands::create_person,
            commands::get_persons,
            commands::update_person,
            // Loans
            commands::preview_loan,
            commands::create_loan,
            commands::get_loans,
            commands::get_loan_detail,
            // Security items
            commands::create_security_item,
            commands::mark_security_item_returned,
            // Payments and collections
            commands::record_admin_payment,
            commands::get_pending_verifications,
            commands::verify_payment,
            commands::reject_payment,
            // Fine waivers
            commands::create_fine_waiver,
            // Profit reports
            commands::get_profit_report,
            // Collectors
            commands::create_collector,
            commands::list_collectors,
            commands::toggle_collector_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
