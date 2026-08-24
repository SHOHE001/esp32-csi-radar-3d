# ESP32 Wi-Fi CSI Radar

接続した ESP32 を、Espressif 公式 ESP-CSI の `console_test` を利用した人の動き・在室変化検知器として動かす構成です。

## セットアップ

Windows PowerShellで次を実行すると、Espressif ESP-CSIを取得してこのプロジェクト用パッチを適用し、Python環境を作成します。

```powershell
.\setup.ps1
```

基準にしたESP-CSIリビジョンは `8633d67` です。

## 現在の実機状態

- ポート: `COM3`
- チップ: `ESP32-D0WD-V3 revision 3.1`
- フラッシュ: 4 MB
- ファームウェア: ESP-CSI `console_test` / `esp-radar 0.3.4` / ESP-IDF `v5.5.5`
- 書き込み・書き込み後ハッシュ検証: 完了
- 起動確認: `console_test`、Wi-Fi STA、ESP-Radar、2 Mbps コンソールの初期化を確認
- Wi-Fiスキャン: 16 APの受信を確認

## 使い方

1. ESP32をUSB接続したまま、`start-radar.cmd` をダブルクリックします。
2. 画面左上の接続欄で、監視場所の **2.4 GHz Wi-Fi** のSSIDとパスワードを入力し、`connect` を押します。
3. ESP32とWi-Fiルーターの間、またはその周辺が検知領域になるように、ESP32を動かない場所へ固定します。最初は1～3 m程度の間隔が調整しやすいです。
4. `Radar model` 側の校正を開始します。`delay` を10秒、`duration` を30秒程度にし、校正中は部屋から出て動かないようにします。
5. 校正後、画面の `someone / noneone` と `move / static`、波形を確認します。誤検知があれば、無人状態でもう一度長めに校正します。

Wi-Fiパスワードはソースコードへ埋め込んでいません。USBシリアル経由でESP32へ設定します。自動接続を選んだ場合はESP32のNVSに保存されます。

## 起動コマンド

```powershell
.\start-radar.ps1 -Port COM3
```

## 推定3Dモーション表示

`start-radar-3d.cmd` をダブルクリックすると、2.4 GHzモバイルホットスポット、従来のESP-CSI画面、ブラウザーの3Dビューアーを起動します。3D画面は実測した `move_status`、CSI jitter、RSSIを約8回/秒で読み込み、動きの強さに合わせて17点の人体骨格を動かします。

- 緑色の信号値・動体判定: ESP32からの実測値
- 人物のX/Z位置・手足の姿勢: 単一ノードの値から生成する推定アニメーション
- データが3秒以上止まった場合: `WAITING` へ切り替わり、古い値をライブ表示しません

起動コマンド:

```powershell
.\start-radar-3d.ps1 -Port COM3 -ViewerPort 8765
```

ローカルURL: `http://127.0.0.1:8765/`

## 再書き込み

ビルド済み一括イメージから再書き込みできます。

```powershell
.\flash-prebuilt.ps1 -Port COM3 -ConfirmFlash
```

ローカルでビルドした完成イメージ: `firmware/esp32-radar-complete.bin`（GitHubには端末固有情報の混入を避けるため含めません）

- サイズ: 1,015,120 bytes
- SHA-256: `AEB033C6436D7760E4FECC98C8C23F93CADD4DB1601669113B37E9F504D09459`

## 以前のファームウェアへ戻す

書き込み前の4 MBフラッシュ全体はローカルの `backup/esp32-before-radar-4mb.bin` に保存します。NVSにWi-Fi設定が含まれる可能性があるためGitHubには含めません。

```powershell
.\restore-backup.ps1 -Port COM3 -ConfirmRestore
```

- サイズ: 4,194,304 bytes
- SHA-256: `A261E2700320881C574AECCE02C6658B24D2CBEF0F2C6215A9274E6B40900E97`

## 制約

この方式はWi-Fi CSIの環境変化を検知します。距離や方位を測るmmWaveレーダーではありません。

- ESP32 1台に加えて2.4 GHz Wi-Fiルーターが必要です。
- 人、ペット、カーテン、扉、移動物体を原理的には区別しません。
- 個人識別、人数、正確な距離・方向は取得できません。
- 設置位置や部屋ごとの校正が必要です。
- 長時間まったく動かない人の在室判定は不安定になり得ます。

より確実な距離・方向付き人検知が必要な場合は、LD2410/LD2450などの外付けmmWaveセンサーをESP32へ接続する構成が適します。

## 出典

- Espressif ESP-CSI: https://github.com/espressif/esp-csi
- ESP-CSI console_test: https://github.com/espressif/esp-csi/tree/master/examples/esp-radar/console_test
