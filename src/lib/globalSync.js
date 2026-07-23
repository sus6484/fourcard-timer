/**
 * @deprecated Firebase 프리셋 동기화는 `presetsSync.js`를 사용하세요.
 */
export {
  fetchPresetsFromCloud as fetchGlobalFromCloud,
  savePresetsToCloud as saveGlobalToCloud,
  subscribePresets,
  isFileProtocol,
} from './presetsSync.js'
