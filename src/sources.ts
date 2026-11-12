export type PickKind = 'file' | 'image' | 'any'

export interface Source {
  id: string
  name: string
  app: string
  mark: string
  hint: string
  steps: string[]
  pick?: PickKind
  pkg?: string
  ios?: string
  note?: string
}

export const sources: Source[] = [
  {
    id: 'proton',
    name: 'Proton',
    app: 'Proton Authenticator',
    mark: 'P',
    hint: 'JSON export',
    pick: 'file',
    pkg: 'proton.android.authenticator',
    ios: 'proton-authenticator://',
    steps: [
      'Open <b>Proton Authenticator</b>.',
      'Go to <b>Settings → Export</b> and save the JSON file.',
      'Come back here and choose that file.',
    ],
    note: 'Proton does not share its database with other apps. Export is the supported path.',
  },
  {
    id: 'google',
    name: 'Google',
    app: 'Google Authenticator',
    mark: 'G',
    hint: 'Export QR codes',
    pick: 'image',
    pkg: 'com.google.android.apps.authenticator2',
    steps: [
      'Open <b>Google Authenticator</b> and tap <b>☰ → Transfer accounts → Export accounts</b>.',
      'Select the accounts and tap <b>Next</b>. One or more QR codes appear.',
      'Photograph each QR with another device, or screenshot it on iPhone.',
      'Choose all the QR images here at once.',
    ],
    note: 'Android blocks screenshots of the export screen. A photo from another phone works. You can also paste an otpauth-migration:// link.',
  },
  {
    id: 'aegis',
    name: 'Aegis',
    app: 'Aegis',
    mark: 'A',
    hint: 'Plain JSON export',
    pick: 'file',
    pkg: 'com.beemdevelopment.aegis',
    steps: [
      'Open <b>Aegis</b> and go to <b>Settings → Import & Export → Export</b>.',
      'Pick <b>Aegis (.JSON)</b> and turn off <b>Encrypt the vault</b>.',
      'Save the file, then choose it here.',
    ],
  },
  {
    id: 'twofas',
    name: '2FAS',
    app: '2FAS',
    mark: '2',
    hint: '.2fas backup file',
    pick: 'file',
    pkg: 'com.twofasapp',
    steps: [
      'Open <b>2FAS</b> and go to <b>Settings → 2FAS Backup → Export to file</b>.',
      'Skip the password so the file is not encrypted.',
      'Choose the <b>.2fas</b> file here.',
    ],
  },
  {
    id: 'bitwarden',
    name: 'Bitwarden',
    app: 'Bitwarden',
    mark: 'B',
    hint: 'Authenticator or vault JSON',
    pick: 'file',
    pkg: 'com.bitwarden.authenticator',
    steps: [
      '<b>Bitwarden Authenticator</b>: <b>Settings → Export</b>, format <b>.json</b>.',
      '<b>Bitwarden vault</b>: <b>Settings → Vault → Export vault</b>, format <b>.json</b> (not encrypted).',
      'Choose the exported file here.',
    ],
  },
  {
    id: 'ente',
    name: 'Ente',
    app: 'Ente Auth',
    mark: 'E',
    hint: 'Plain text export',
    pick: 'file',
    pkg: 'io.ente.auth',
    steps: [
      'Open <b>Ente Auth</b> and go to <b>Settings → Data → Export codes</b>.',
      'Choose <b>Plain text</b> and save the file.',
      'Choose that file here.',
    ],
  },
  {
    id: 'lastpass',
    name: 'LastPass',
    app: 'LastPass Authenticator',
    mark: 'L',
    hint: 'JSON export',
    pick: 'file',
    pkg: 'com.lastpass.authenticator',
    steps: [
      'Open <b>LastPass Authenticator</b> and go to <b>Settings → Transfer accounts</b>.',
      'Tap <b>Export accounts to file</b> and save it.',
      'Choose that file here.',
    ],
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    app: 'Microsoft Authenticator',
    mark: 'M',
    hint: 'No export available',
    pkg: 'com.azure.authenticator',
    steps: [
      'Microsoft Authenticator cannot export your codes.',
      'For each site, turn two-factor off and on again to get a new setup QR.',
      'Save that QR as an image and choose it here, then finish setup on the site.',
    ],
    note: 'Setup QR images from any website import fine through <b>Other apps</b>.',
  },
  {
    id: 'authy',
    name: 'Authy',
    app: 'Twilio Authy',
    mark: 'T',
    hint: 'No export available',
    pkg: 'com.authy.authy',
    steps: [
      'Authy keeps its secrets locked and has no export.',
      'For each site, re-enroll two-factor to get a new setup QR.',
      'Save that QR as an image and choose it here.',
    ],
    note: 'Setup QR images from any website import fine through <b>Other apps</b>.',
  },
  {
    id: 'other',
    name: 'Other apps',
    app: 'Other apps',
    mark: '+',
    hint: 'andOTP, FreeOTP+, Stratum, Raivo, QR',
    pick: 'any',
    steps: [
      '<b>andOTP</b>: Backups → Backup (plain-text).',
      '<b>FreeOTP+</b>: ⋮ → Export JSON format.',
      '<b>Stratum / Authenticator Pro</b>: Backup → without password.',
      '<b>Raivo</b>: unzip the export and choose the JSON inside.',
      'Any setup QR image or a list of otpauth:// links also works.',
    ],
  },
]

export function sourceById(id: string): Source | undefined {
  return sources.find((source) => source.id === id)
}

export function launchUrl(source: Source): string | null {
  if (/android/i.test(navigator.userAgent) && source.pkg) {
    return `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${source.pkg};end`
  }
  return source.ios ?? null
}

export const acceptFor: Record<PickKind, string> = {
  file: '.json,.2fas,.txt,.csv,application/json,text/plain',
  image: 'image/*',
  any: '.json,.2fas,.txt,.csv,application/json,text/plain,image/*',
}
