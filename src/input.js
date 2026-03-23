

document.addEventListener("DOMContentLoaded", function () {
    // マジックナンバーの定義
    const LONG_PRESS_DELAY = 500; // 長押し開始までの遅延 (ms)
    const LONG_PRESS_INTERVAL = 100; // 長押し中の実行間隔 (ms)
    const DEFAULT_MIN = 0; // 最小値のデフォルト
    const DEFAULT_MAX = 99; // 最大値のデフォルト
    const DEFAULT_INITIAL_VALUE = 0; // 初期値のデフォルト

    const buttonGroups = document.querySelectorAll(".button-group");

    buttonGroups.forEach((buttonGroup) => {
        const counter = buttonGroup.querySelector(".counter");
        const initialValue = counter.value || DEFAULT_INITIAL_VALUE; // HTMLのinput要素の初期値を取得

        // 最小値と最大値を取得
        const min = parseInt(buttonGroup.getAttribute("data-min"), 10) || DEFAULT_MIN;
        const max = parseInt(buttonGroup.getAttribute("data-max"), 10) || DEFAULT_MAX;

        // ボタン要素を取得
        const minusButton = buttonGroup.querySelector(".minus").parentElement;
        const plusButton = buttonGroup.querySelector(".plus").parentElement;
        const minButton = buttonGroup.querySelector(".min").parentElement;
        const maxButton = buttonGroup.querySelector(".max").parentElement;

        // ボタンの状態を更新する関数
        function updateButtonState() {
            const value = Number(counter.value);

            // 下限値の場合
            if (value <= min) {
                minusButton.classList.add("disabled");
                minButton.classList.add("disabled");
            } else {
                minusButton.classList.remove("disabled");
                minButton.classList.remove("disabled");
            }

            // 上限値の場合
            if (value >= max) {
                plusButton.classList.add("disabled");
                maxButton.classList.add("disabled");
            } else {
                plusButton.classList.remove("disabled");
                maxButton.classList.remove("disabled");
            }
        }

        // 初期状態を設定
        updateButtonState();

        // 値を増減する共通関数
        function decrementValue() {
            let value = Math.max(min, Number(counter.value) - 1);
            counter.value = value;
            updateButtonState();
        }

        function incrementValue() {
            let value = Math.min(max, Number(counter.value) + 1);
            counter.value = value;
            updateButtonState();
        }

        let intervalId = null; // 長押し時のインターバルID
        let timeoutId = null; // 長押し開始までの遅延タイマーID
        let keyPressed = false; // キーが押されている状態を追跡
        let keyIntervalId = null; // キーボード長押し用のインターバルID
        let keyTimeoutId = null; // キーボード長押し開始までの遅延タイマーID

        // 長押し処理を追加する関数
        function addLongPressEvent(button, action) {
            button.addEventListener("mousedown", () => {
                timeoutId = setTimeout(() => {
                    intervalId = setInterval(action, LONG_PRESS_INTERVAL); // 長押し中の実行間隔
                }, LONG_PRESS_DELAY); // 長押し開始までの遅延
                action(); // 最初のクリック時に1回実行
            });

            button.addEventListener("mouseup", () => {
                clearTimeout(timeoutId); // 遅延タイマーをクリア
                clearInterval(intervalId); // 長押し解除
            });

            button.addEventListener("mouseleave", () => {
                clearTimeout(timeoutId); // 遅延タイマーをクリア
                clearInterval(intervalId); // ボタン外にカーソルが移動した場合も解除
            });

            button.addEventListener("touchstart", (e) => {
                e.preventDefault(); // タッチイベントのデフォルト動作を防止
                timeoutId = setTimeout(() => {
                    intervalId = setInterval(action, LONG_PRESS_INTERVAL);
                }, LONG_PRESS_DELAY); // 長押し開始までの遅延
                action();
            });

            button.addEventListener("touchend", () => {
                clearTimeout(timeoutId); // 遅延タイマーをクリア
                clearInterval(intervalId);
            });

            button.addEventListener("touchcancel", () => {
                clearTimeout(timeoutId); // 遅延タイマーをクリア
                clearInterval(intervalId);
            });
        }

        // ボタンのクリックイベント
        addLongPressEvent(minusButton, decrementValue);
        addLongPressEvent(plusButton, incrementValue);

        minButton.addEventListener("click", () => {
            counter.value = min;
            updateButtonState();
        });

        maxButton.addEventListener("click", () => {
            counter.value = max;
            updateButtonState();
        });

        // キーボード操作でボタンを動作させる
        buttonGroup.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !keyPressed) {
                keyPressed = true;
                const activeElement = document.activeElement;
                let action = null;

                if (activeElement === minusButton) {
                    action = decrementValue;
                } else if (activeElement === plusButton) {
                    action = incrementValue;
                }

                if (action) {
                    // 初回のアクション実行
                    action();

                    // マウス長押しと同様のタイミングでインターバル設定
                    keyTimeoutId = setTimeout(() => {
                        keyIntervalId = setInterval(action, LONG_PRESS_INTERVAL); // 長押し中の実行間隔
                    }, LONG_PRESS_DELAY); // 長押し開始までの遅延
                }
            }

            if (event.key === "Escape") {
                const activeElement = document.activeElement;
                if (buttonGroup.contains(activeElement)) {
                    activeElement.blur(); // Escキーでフォーカスを外す
                }
            }
        });

        buttonGroup.addEventListener("keyup", (event) => {
            if (event.key === "Enter") {
                keyPressed = false;
                clearTimeout(keyTimeoutId);
                clearInterval(keyIntervalId);
            }
        });

        // ボタンから離れた場合もキーボードの長押しをクリア
        buttonGroup.addEventListener("blur", () => {
            if (keyPressed) {
                keyPressed = false;
                clearTimeout(keyTimeoutId);
                clearInterval(keyIntervalId);
            }
        }, true);

        // 入力イベントで全角数字を半角数字に変換し、範囲を制限
        counter.addEventListener("input", () => {
            // 全角数字を半角数字に変換
            let value = counter.value.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 65248));

            // 数値以外を除去
            value = value.replace(/[^0-9]/g, ""); // 数字以外を削除

            // 範囲を制限
            if (value !== "") {
                value = Math.max(min, Math.min(max, Number(value)));
            }

            counter.value = value; // 入力フィールドに反映
            updateButtonState();
        });

        // フォーカスが外れたときにデフォルト値に戻す
        counter.addEventListener("blur", () => {
            if (counter.value === "") {
                counter.value = initialValue; // HTMLのinput要素の初期値に戻す
                updateButtonState();
            }
        });

        // Helper function to navigate between counters
        function navigateCounters(currentCounter, direction) {
            const counters = Array.from(document.querySelectorAll(".counter"));
            const currentIndex = counters.indexOf(currentCounter);

            if (direction === "next" && currentIndex !== -1 && currentIndex < counters.length - 1) {
                counters[currentIndex + 1].focus();
            } else if (direction === "previous" && currentIndex > 0) {
                counters[currentIndex - 1].focus();
            } else {
                currentCounter.blur(); // 次または前のcounterがない場合はフォーカスを外す
            }
        }

        // Consolidated keydown event listener for counter
        counter.addEventListener("keydown", (event) => {
            switch (event.key) {
                case "Enter":
                    event.preventDefault(); // デフォルトのEnter動作を防止
                    navigateCounters(counter, event.shiftKey ? "previous" : "next");
                    break;

                case "ArrowUp":
                    event.preventDefault(); // デフォルトの上矢印キー動作を防止
                    navigateCounters(counter, "previous");
                    break;

                case "ArrowDown":
                    event.preventDefault(); // デフォルトの下矢印キー動作を防止
                    navigateCounters(counter, "next");
                    break;

                case "Escape":
                    counter.blur(); // Escキーでフォーカスを外す
                    break;

                default:
                    // 他のキーの処理が必要な場合はここに追加
                    break;
            }
        });

        counter.addEventListener("focus", () => {
            // カーソルを右端に移動
            const length = counter.value.length;
            counter.setSelectionRange(length, length);
        });

        // Consolidated keydown event listener for buttons
        [minusButton, plusButton, minButton, maxButton].forEach((button) => {
            button.addEventListener("keydown", (event) => {
                if (event.key === "Escape") {
                    button.blur(); // Escキーでフォーカスを外す
                }
            });
        });
    });
});
