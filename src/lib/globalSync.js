/**
 * @deprecated Google Sheets 동기화는 Firebase(Firestore)로 이전되었습니다.
 * 새 코드는 `presetsSync.js`를 사용하세요.
 * `migratePresetsFromSheets`만 레거시 시트 GET을 사용합니다.
 */
export {
  fetchPresetsFromCloud as fetchGlobalFromCloud,
  savePresetsToCloud as saveGlobalToCloud,
  subscribePresets,
  migratePresetsFromSheets,
  isFileProtocol,
  LEGACY_SHEETS_URL,
} from './presetsSync.js'
