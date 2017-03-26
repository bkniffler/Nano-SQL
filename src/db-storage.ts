import { NanoSQLInstance, _assign, NanoSQLBackend, ActionOrView, QueryLine, DBRow, DataModel, StdObject, DBConnect, DBExec, JoinArgs, DBFunction } from "./index";
import { _NanoSQLDB } from "./db-index";
import { _functions } from "./db-query";

declare var levelup: any, fs: any;

// Bypass uglifyjs minifaction of these properties
const _str = (index: number) => {
    return ["_utility", "_historyPoints"][index];
}

export interface IHistoryPoint {
    id: number;
    historyPoint: number;
    tableID: number;
    rowKeys: number[];
    type: string;
}

// tslint:disable-next-line
export class _NanoSQL_Storage {

    public _mode;

    public _indexedDB: IDBDatabase;

    public _parent: _NanoSQLDB;

    /**
     * Stores a row index for each table.
     *
     * @internal
     * @type {{
     *         [tableHash: number]: Array<DataModel>;
     *     }}
     * @memberOf _NanoSQLDB
     */
    public _models: {
        [tableHash: number]: Array<DataModel>;
    };

    /**
     * Utility data for each table, including holding the primary key, name, incriment number and primary keys
     *
     * @type {{
     *         [tableHash: number]: {
     *             _pk: string // Table primary key
     *             _pkType: string; // Primary key data type
     *             _name: string // Table name
     *             _incriment: number; // Table incriment counter
     *             _index: string[]; // The table index of row IDs in this table
     *             _keys: string[]; // Array of column keys
     *             _defaults: any[]; // Array of column defaults
     *             _rows: { // If memory mode is enabled, row data is stored here.
     *                 [key: string]: DBRow
     *             }
     *         }
     *     }}
     * @memberOf _NanoSQL_Storage
     */
    public _tables: {
        [tableHash: number]: {
            _pk: string
            _pkType: string;
            _name: string
            _incriment: number;
            _index: string[];
            _keys: string[];
            _defaults: any[];
            _rows: {
                [key: string]: DBRow|null
            }
        }
    };


    /**
     * Mirror of active tables, contains all the row modifications
     *
     * @type {{
     *         [tableHash: number]}
     * @memberOf _NanoSQLDB
     */
/*    public _historyDataTables: {
        [tableHash: number]: (DBRow|null)[]
    };*/

    /**
     * Need to store an auto incriment style counter for history data tables.
     *
     * @type {{
     *         [tableHash: number]: number;
     *     }}
     * @memberOf _NanoSQL_Storage
     */
/*    public _historyDataTableLengths: {
        [tableHash: number]: number;
    };*/

    /**
     * Contains the records needed to keep track of and adjust the row histories.
     *
     * Only used if the memory database is enabled.
     *
     * @type {{
     *         [tableHash: number]: {
     *             [rowKey: string]: {
     *                 _pointer: number,
     *                 _historyDataRowIDs: number[]
     *             }
     *         }
     *     }}
     * @memberOf _NanoSQLDB
     */
/*    public _historyMetaTables: {
        [tableHash: number]: {
            [rowKey: string]: {
                _pointer: number,
                _historyDataRowIDs: number[]
            }
        }
    };*/


    /**
     * Utility table to store misc data.
     *
     * This is populated regardless of the memory db setting.
     *
     * @type {{
     *         [key: string]: {
     *             key: string,
     *             value: any;
     *         }
     *     }}
     * @memberOf _NanoSQL_Storage
     */
    public _utilityTable: {
        [key: string]: {
            key: string,
            value: any;
        }
    };

    /**
     * The pointer that indiciates where in history to pull from.
     *
     * @internal
     * @type {number}
     * @memberOf _NanoSQLDB
     */
    public _historyPoint: number;

    /**
     * Keeps track of how many total history points we have
     *
     * @type {number}
     * @memberOf _NanoSQLDB
     */
    public _historyLength: number;

    /**
     * A variable to hold the state of the history pointer and history length
     *
     * @internal
     * @type {Array<number>}
     * @memberOf _NanoSQLDB
     */
    public _historyArray: Array<number>;

    /**
     * Flag to indicate the state of transactions
     *
     * @type {boolean}
     * @memberOf _NanoSQLDB
     */
    public _doingTransaction: boolean;

    /**
     * Wether to enable the persistent storage system or not.
     *
     * @type {boolean}
     * @memberOf _NanoSQLDB
     */
    public _persistent: boolean;

    /**
     * Flag to store wether history is enabled or not.
     *
     * @type {boolean}
     * @memberOf _NanoSQLDB
     */
    public _doHistory: boolean;

    /**
     * Flag to store wether tables are stored in memory or not.
     *
     * @type {boolean}
     * @memberOf _NanoSQLDB
     */
    public _storeMemory: boolean;

    /**
     * Save the connect args so we can re init the store on command.
     *
     * @type {DBConnect}
     * @memberOf _NanoSQL_Storage
     */
    public _savedArgs: DBConnect;

    /**
     * WebSQL database object.
     *
     * @type {Database}
     * @memberOf _NanoSQL_Storage
     */
    // public _webSQL: Database;

    /**
     * Level Up store variable.
     *
     * @type {{
     *         [key: string]: any;
     *     }}
     * @memberOf _NanoSQL_Storage
     */
    public _levelDBs: {
        [key: string]: any;
    };

    constructor(database: _NanoSQLDB, args: DBConnect) {
        this._savedArgs = args;
        this.init(database, args);
    }

    /**
     * Setup persistent storage engine and import any existing data into memory.
     *
     * @static
     * @param {_NanoSQLDB} database
     * @param {DBConnect} args
     * @returns {boolean}
     *
     * @memberOf _NanoSQL_Persistent
     */
    public init(database: _NanoSQLDB, args: DBConnect) {
        let t = this;
        t._models = {};
        t._tables = {};
        t._levelDBs = {};
        t._historyPoint = 0;
        t._historyLength = 0;
        t._historyArray = [0, 0];
        t._doingTransaction = false;
        t._doHistory = true;
        t._storeMemory = true;
        t._persistent = false;
        t._utilityTable = {};

        t._mode = 0;
        t._parent = database;

        let size: number = 5;
        if (args._config.length) {
            t._persistent = args._config[0].persistent !== undefined ? args._config[0].persistent : false;
            t._doHistory = args._config[0].history !== undefined ? args._config[0].history : true;
            t._storeMemory = args._config[0].memory !== undefined ? args._config[0].memory : true;
            size = args._config[0].size || 5;
            t._mode = {
                IDB: 1,
                LS: 2,
                // WSQL: 3,
                LVL: 4
            }[args._config[0].mode] || 0;
        }

        let upgrading = false;
        let index = 0;
        let isNewStore = true;

        Object.keys(args._models).forEach((t) => {
            args._models["_" + t + "_hist__data"] = _assign(args._models[t]);
            args._models["_" + t + "_hist__data"] = args._models["_" + t + "_hist__data"].map((m) => {
                delete m.props;
                return m;
            });
            // args._models["_" + t + "_hist__data"].unshift({key: "__id", type: "int", props:["ai", "pk"]});
            args._models["_" + t + "_hist__meta"] = [
                {key: "id", type: "int", props: ["ai", "pk"]},
                {key: "_pointer", type: "int"},
                {key: "_historyDataRowIDs", type: "array"},
            ];
        });

        args._models[_str(0)] = [
            {key: "key", type: "string", props: ["pk"]},
            {key: "value", type: "blob"},
        ];

        args._models[_str(1)] = [
            {key: "id", type: "int", props: ["ai", "pk"]},
            {key: "tableID", type: "int"},
            {key: "historyPoint", type: "int"},
            {key: "rowKeys", type: "array"},
            {key: "type", type: "string"}
        ];

        let tables = Object.keys(args._models);

        let beforeHist;
        let beforeMode;

        Object.keys(args._models).forEach((tableName) => {
            t._newTable(tableName, args._models[tableName]);
        });

        Object.keys(args._functions || []).forEach((f) => {
            _functions[f] = args._functions[f];
        });

        const completeSetup = () => {
            let tables = Object.keys(args._models);
            let i = 0;

            t._mode = beforeMode;
            if (beforeHist) {
                t._read(_str(0), "all", (rows) => {
                    rows.forEach((d) => {
                        t._utility("w", d.key, d.value);
                        if (d.key === "historyPoint") t._historyPoint = d.value || 0;
                        if (d.key === "historyLength") t._historyLength = d.value || 0;
                    });
                });
            }

            if (isNewStore) {
                const step = () => {
                    if (i < tables.length) {
                        if (tables[i].indexOf("_hist__data") !== -1) {
                            t._upsert(tables[i], 0, null, () => {
                                i++;
                                step();
                            });
                        } else {
                            i++;
                            step();
                        }
                    } else {
                        t._doHistory = beforeHist;
                        args._onSuccess();
                    }
                };
                step();
            } else {
                t._doHistory = beforeHist;
                args._onSuccess();
            }
        };

        beforeMode = t._mode;

        /**
         * mode 0: no persistent storage, memory only
         * mode 1: Indexed DB // Preferred, forward compatible browser persistence
         * mode 2: Local Storage // Default fallback
         * mode 3: WebSQL // Safari hates IndexedDB, use this (non standard) fallback for iOS devices and macOS running safari
         * mode 4: Level Up // Used by NodeJS
         */
        if (t._persistent) {
            if (t._mode !== 0) { // Mode has been set by dev, make sure it will work in our current environment.  If not, set mode to 0
                switch (t._mode) {
                    case 1: if (typeof indexedDB === "undefined") t._mode = 0;
                    break;
                    case 2: if (typeof localStorage === "undefined") t._mode = 0;
                    break;
                    // case 3: if (typeof window === "undefined" || typeof window.openDatabase === "undefined") t._mode = 0;
                    case 3: t._mode = 0;
                    break;
                    case 4: if (typeof window !== "undefined") t._mode = 0;
                    break;
                }
            } else { // Auto detect mode
                if (typeof window !== "undefined") {
                    if (typeof localStorage !== "undefined")                t._mode = 2; // Local storage is the fail safe
                    if (typeof indexedDB !== "undefined")                   t._mode = 1; // Use indexedDB instead if it's there
                    // if ((t._iOS() || t._safari()) && window.openDatabase)   t._mode = 3; // On iOS & Safari, use WebSQL instead of indexedDB.
                }
                if (typeof levelup !== "undefined" && typeof fs !== "undefined") {
                    t._mode = 4; // Use LevelUp in NodeJS if it's there.
                }
            }
        } else {
            t._mode = 0;
            completeSetup();
        }

        beforeHist = t._doHistory;
        beforeMode = t._mode;
        t._mode = 0;
        t._doHistory = false;

        switch (beforeMode) {
            case 1: // Indexed DB
                let idb = indexedDB.open(String(t._parent._databaseID), 1);

                // Called only when there is no existing DB, creates the tables and data store.
                idb.onupgradeneeded = (event: any) => {
                    upgrading = true;
                    let db: IDBDatabase = event.target.result;
                    let transaction: IDBTransaction = event.target.transaction;
                    t._indexedDB = db;
                    const next = () => {
                        if (index < tables.length) {
                            let ta = NanoSQLInstance._hash(tables[index]);
                            let config = t._tables[ta]._pk ? { keyPath: t._tables[ta]._pk } : {};
                            db.createObjectStore(t._tables[ta]._name, config); // Standard Tables
                            index++;
                            next();
                        } else {
                            transaction.oncomplete = () => {
                                completeSetup();
                            };
                        }
                    };
                    next();
                };

                // Called once the database is connected and working
                idb.onsuccess = (event: any) => {
                    t._indexedDB = event.target.result;

                    // Called to import existing indexed DB data into the memory store.
                    if (!upgrading) {
                        isNewStore = false;

                        const next = () => {
                            if (index >= tables.length) {
                                completeSetup();
                                return;
                            }

                            // Do not import history tables if history is disabled.
                            if (!beforeHist && (tables[index].indexOf("_hist__data") !== -1 || tables[index].indexOf("_hist__meta") !== -1)) {
                                index++;
                                next();
                                return;
                            }

                            // Load data from indexed DB into memory store
                            if (index < tables.length) {
                                let ta = NanoSQLInstance._hash(tables[index]);
                                let transaction = t._indexedDB.transaction(tables[index], "readonly");
                                let store = transaction.objectStore(tables[index]);
                                let cursorRequest = store.openCursor();
                                let items: any[] = [];
                                transaction.oncomplete = () => {

                                    if (t._storeMemory) {
                                        if (tables[index].indexOf("_hist__data") !== -1) {
                                            t._tables[ta]._index.push("0");
                                            t._tables[ta]._rows["0"] = null;
                                            t._tables[ta]._incriment++;
                                            t._parent._parent.loadJS(tables[index], items).then(() => {
                                                index++;
                                                next();
                                            });
                                        } else {
                                            t._parent._parent.loadJS(tables[index], items).then(() => {
                                                index++;
                                                next();
                                            });
                                        }
                                    } else {
                                        t._tables[ta]._index = items;
                                        t._tables[ta]._incriment = items.reduce((prev, cur) => {
                                            return Math.max(parseInt(cur), prev);
                                        }, 0) + 1;
                                        index++;
                                        next();
                                    }

                                };

                                cursorRequest.onsuccess = (evt: any) => {
                                    let cursor: IDBCursorWithValue = evt.target.result;
                                    if (cursor) {
                                        items.push(t._storeMemory ? cursor.value : cursor.key);
                                        cursor.continue();
                                    }
                                };

                            }
                        };

                        next();
                    };
                };
            break;
            case 2: // Local Storage
                if (localStorage.getItem("dbID") !== String(t._parent._databaseID)) { // New storage, just set it up
                    localStorage.clear();
                    localStorage.setItem("dbID", String(t._parent._databaseID));
                    tables.forEach((table) => {
                        let ta = NanoSQLInstance._hash(table);
                        localStorage.setItem(table, JSON.stringify([]));
                    });
                    completeSetup();
                } else { // Existing, import data from local storage
                    isNewStore = false;
                    // import indexes no matter what
                    tables.forEach((tName) => {
                        let ta = NanoSQLInstance._hash(tName);
                        let tableIndex = JSON.parse(localStorage.getItem(tName) || "[]");
                        t._tables[ta]._index = tableIndex;

                        if (!t._storeMemory) {
                            t._tables[ta]._incriment = tableIndex.reduce((prev, cur) => {
                                return Math.max(parseInt(cur), prev);
                            }, 0) + 1;
                        }
                    });

                    // only import data if the memory store is enabled
                    if (t._storeMemory) {
                        let tIndex = 0;
                        const step = () => {
                            if (tIndex < tables.length) {
                                let items: any[] = [];

                                // Do not import history tables if history is disabled.
                                if (!beforeHist && (tables[tIndex].indexOf("_hist__data") !== -1 || tables[index].indexOf("_hist__meta") !== -1)) {
                                    tIndex++;
                                    step();
                                    return;
                                }

                                JSON.parse(localStorage.getItem(tables[tIndex]) || "[]").forEach((ptr) => {
                                    items.push(JSON.parse(localStorage.getItem(tables[tIndex] + "-" + ptr) || ""));
                                });
                                t._parent._parent.loadJS(tables[tIndex], items).then(() => {
                                    tIndex++;
                                    step();
                                });
                            } else {
                                completeSetup();
                            }
                        };
                        step();
                    } else {
                        completeSetup();
                    }
                }
            break;
            /*case 3: // WebSQL

                const success = (tx, rows) => {
                    console.log(rows);
                };

                const error = (tx, error): boolean => {
                    console.log(error);
                    return true;
                }

                const ct = "CREATE TABLE IF NOT EXISTS ";
                const newStore = () => {
                    t._webSQL.transaction((tx) => {
                        tx.executeSql(ct + "tableID (id TEXT);", [], success, error);
                        tx.executeSql("INSERT INTO tableID (id) VALUES (?)", [t._parent._databaseID], success, error);
                        tables.forEach((table) => {
                            let ta = NanoSQLInstance._hash(table);
                            tx.executeSql(ct + table + "(" + t._tables[ta]._keys.join(", ") + ");", [], success, error);
                        });
                        completeSetup();
                    });
                };

                const existingTables = () => {
                    isNewStore = false;
                    index = 0;
                    const next = () => {
                        if (index >= tables.length) {
                            completeSetup();
                            return;
                        }

                        // Do not import history tables if history is disabled.
                        if (!beforeHist && (tables[index].indexOf("_hist__data") !== -1 || tables[index].indexOf("_hist__meta") !== -1)) {
                            index++;
                            next();
                            return;
                        }

                        // Load data from WebSQL into memory store
                        if (index < tables.length) {
                            let ta = NanoSQLInstance._hash(tables[index]);
                            let pk = t._tables[ta]._pk;
                            t._webSQL.transaction((tx) => {
                                tx.executeSql("SELECT * FROM " + tables[index], [], (tx, result) => {

                                    let items: any[] = [];
                                    let ptr = result.rows.length;

                                    while (ptr--) {
                                        let r = result.rows.item(ptr);
                                        items.unshift(t._storeMemory ? r : r[pk] | ptr);
                                    }

                                    if (t._storeMemory) {
                                        if (tables[index].indexOf("_hist__data") !== -1) {
                                            t._tables[ta]._index.push("0");
                                            t._tables[ta]._rows["0"] = null;
                                            t._tables[ta]._incriment++;
                                            t._parent._parent.table(tables[index]).loadJS(items).then(() => {
                                                index++;
                                                next();
                                            });
                                        } else {
                                            t._parent._parent.table(tables[index]).loadJS(items).then(() => {
                                                index++;
                                                next();
                                            });
                                        }
                                    } else {
                                        t._tables[ta]._index = items;
                                        t._tables[ta]._incriment = items.reduce((prev, cur) => {
                                            return Math.max(parseInt(cur), prev);
                                        }, 0) + 1;
                                        index++;
                                        next();
                                    }
                                });
                            });
                        }
                    };

                    next();
                };

                t._webSQL = window.openDatabase(String(t._parent._databaseID), "1", String(t._parent._databaseID), size * 1024 * 1024);
                t._webSQL.transaction((tx) => {
                    tx.executeSql("SELECT * FROM tableID;", [], (tx, results) => {
                        let dbID = parseInt(results.rows[0].id);
                        if (dbID === t._parent._databaseID) {
                            existingTables();
                        } else {
                            t._webSQLEmpty(newStore);
                        }
                    }, (tx, error): boolean => {
                        newStore();
                        return true;
                    });
                });
            break;*/
            /* NODE-START */
            case 4: // Level Up

                // Called to import existing  data into the memory store.
                const existingStore = () => {

                    isNewStore = false;

                    const next = () => {
                        if (index < tables.length) {

                            // Do not import history tables if history is disabled.
                            if (!beforeHist && (tables[index].indexOf("_hist__data") !== -1 || tables[index].indexOf("_hist__meta") !== -1)) {
                                index++;
                                next();
                                return;
                            }

                            // Load data from level up into memory store
                            if (index < tables.length) {
                                let ta = NanoSQLInstance._hash(tables[index]);
                                let items: any[] = [];
                                if (t._storeMemory) {
                                    t._levelDBs[tables[index]].createValueStream()
                                    .on("data", (data) => {
                                        items.push(JSON.parse(data));
                                    })
                                    .on("end", () => {
                                        if (tables[index].indexOf("_hist__data") !== -1) {
                                            t._tables[ta]._index.push("0");
                                            t._tables[ta]._rows["0"] = null;
                                            t._tables[ta]._incriment++;
                                            t._parent._parent.table().loadJS(tables[index], items).then(() => {
                                                index++;
                                                next();
                                            });
                                        } else {
                                            t._parent._parent.loadJS(tables[index], items).then(() => {
                                                index++;
                                                next();
                                            });
                                        }
                                    });
                                } else {
                                    t._levelDBs[tables[index]].createKeyStream()
                                    .on("data", (data) => {
                                        items.push(data);
                                    })
                                    .on("end", () => {
                                        t._tables[ta]._index = items;
                                        t._tables[ta]._incriment = items.reduce((prev, cur) => {
                                            return Math.max(parseInt(cur), prev);
                                        }, 0) + 1;
                                        index++;
                                        next();
                                    });
                                }
                            }
                        } else {
                            completeSetup();
                            return;
                        }

                    };

                    next();
                };

                const dbFolder = "./db_" + t._parent._databaseID;
                let existing = true;
                if (!fs.existsSync(dbFolder)) {
                    fs.mkdirSync(dbFolder);
                    existing = false;
                }

                tables.forEach((table) => {
                    t._levelDBs[table] = levelup(dbFolder + "/" + table);
                });

                if (existing) {
                    existingStore();
                } else {
                    completeSetup();
                }

            break;
            /* NODE-END */
        }

    }
/*
    public _webSQLEmpty(callBack: Function): void {
        this._webSQL.transaction((tx) => {
            tx.executeSql("SELECT name FROM sqlite_master WHERE type = 'table' AND name != '__WebKitDatabaseInfoTable__'", [], (tx, result) => {
                let i = result.rows.length;
                while (i--) {
                    tx.executeSql("DROP TABLE " + result.rows.item(i).name);
                }
                callBack();
            });
        });
    }
*/
    public _clearHistory(complete: Function): void {
        let t = this;

        let tables = Object.keys(t._tables);
        let index = 0;
        const step = () => {
            if (index < tables.length) {
                if (tables[index].indexOf("_hist__meta") !== -1) {

                }

                if (tables[index].indexOf("_hist__data") !== -1) {

                }

                if (tables[index] === "_historyPoints") {

                }
            } else {
                complete();
            }
        };

        step();
    }


    public _delete(tableName: string, rowID: string|number, callBack?: (success: boolean) => void): void {
        let t = this;
        let editingHistory = false;

        const ta = NanoSQLInstance._hash(tableName);
        t._tables[ta]._index.splice(t._tables[ta]._index.indexOf(String(rowID)), 1); // Update Index

        if (t._storeMemory) {
            console.log(t._tables);
            delete t._tables[ta]._rows[rowID];
            if (t._mode === 0 && callBack) return callBack(true);
        }

        switch (t._mode) {
            case 1: // IndexedDB
                const transaction = t._indexedDB.transaction(tableName, "readwrite").objectStore(tableName);
                transaction.delete(rowID);
                if (callBack) callBack(true);
            break;
            case 2: // Local Storage
                localStorage.removeItem(tableName + "-" + String(rowID));
                localStorage.setItem(tableName, JSON.stringify(t._tables[ta]._index));
                if (callBack) callBack(true);
            break;
            /*case 3: // WebSQL
                t._webSQL.transaction((tx) => {
                    let pk = t._tables[ta]._pk;
                    tx.executeSql("DELETE FROM " + tableName + " WHERE " + pk + " = ?", [rowID]);
                });
            break;*/
            /* NODE-START */
            case 4: // Level Up
                t._levelDBs[tableName].del(rowID, () => {
                    if (callBack) callBack(true);
                });
            break;
            /* NODE-END */
        }
    }

    public _upsert(tableName: string, rowID: string|number|null, value: any, callBack?: (rowID: number|string) => void): void {
        let t = this;
        const ta = NanoSQLInstance._hash(tableName);

        if (rowID === undefined || rowID === null) {
            t._models[ta].forEach((m) => {
                if (m.props && m.props.indexOf("pk") !== -1) {
                    if (m.type === "uuid") {
                        rowID = NanoSQLInstance.uuid();
                    } else {
                        rowID = t._tables[ta]._incriment++;
                    }
                }
            });

            if (!rowID) rowID = parseInt(t._tables[ta]._index[t._tables[ta]._index.length - 1] || "0") + 1;
        }

        if (t._tables[ta]._pkType === "int") rowID = parseInt(rowID as string);

        const pk = t._tables[ta]._pk;
        if (pk && pk.length && value && !value[pk]) {
            value[pk] = rowID;
        }

        // Index update
        if (t._tables[ta] && t._tables[ta]._index.indexOf(String(rowID)) === -1) {
            t._tables[ta]._index.push(String(rowID));
        }

        // Memory Store Update
        if (t._storeMemory && t._tables[ta]) {
            t._tables[ta]._rows[rowID] = t._parent._deepFreeze(value, ta);
            if (t._mode === 0 && callBack) return callBack(rowID);
        }

        switch (t._mode) {
            case 1: // IndexedDB
                const transaction = t._indexedDB.transaction(tableName, "readwrite");
                const store = transaction.objectStore(tableName);
                if (pk.length && value) {
                    store.put(value);
                } else {
                    if (tableName.indexOf("_hist__data") !== -1) {
                        store.put(value, rowID);
                    } else {
                        if (value) store.put(value);
                        if (!value) store.delete(rowID);
                    }
                }
                transaction.oncomplete = function() {
                    if (callBack) callBack(rowID as string);
                };
            break;
            case 2: // Local Storage
                localStorage.setItem(tableName + "-" + String(rowID), value ? JSON.stringify(value) : "");
                localStorage.setItem(tableName, JSON.stringify(t._tables[ta]._index));
                if (callBack) callBack(rowID as string);
            break;
            /*case 3: // WebSQL
                t._webSQL.transaction((tx) => {
                    let pk = t._tables[ta]._pk;
                    let values = t._models[ta].map((val, i) => {
                        if (val.type === "map" || val.type === "array") {
                            return JSON.stringify(value[val.key]);
                        } else {
                            return value ? value[val.key] : null;
                        }
                    });

                    tx.executeSql("SELECT * FROM " + tableName + " WHERE " + (pk.length ? pk : "rowid") + " = ?", [rowID], (txx, result) => {
                        if (!result.rows.length) {
                            tx.executeSql("INSERT INTO '" + tableName + "' (" + t._tables[ta]._keys.join(", ") + ") VALUES (" + t._tables[ta]._keys.map(k => "?").join(", ") + ");", values, () => {
                                if (callBack) callBack(rowID as string);
                            });
                        } else {
                            values.push(rowID);
                            tx.executeSql("UPDATE '" + tableName + "' SET " + t._tables[ta]._keys.map((k) => k + " = ?").join(", ")  + " WHERE " + pk + " = ?", values, () => {
                                if (callBack) callBack(rowID as string);
                            });
                        }
                    });

                });
            break;*/
            /* NODE-START */
            case 4: // Level Up

                if (tableName.indexOf("_hist__data") !== -1) {
                    t._levelDBs[tableName].put(String(rowID), JSON.stringify(value), () => {
                        if (callBack) callBack(rowID as string);
                    });
                } else {
                    if (value) {
                        t._levelDBs[tableName].put(String(rowID), JSON.stringify(value), () => {
                            if (callBack) callBack(rowID as string);
                        });
                    } else {
                        t._levelDBs[tableName].del(String(rowID), () => {
                            if (callBack) callBack(rowID as string);
                        });
                    }
                }


            break;
            /* NODE-END */
        }

    }

    public _read(tableName: string, row: string|number|Function, callBack: (rows: any[]) => void): void {
        let t = this;

        const ta = NanoSQLInstance._hash(tableName);
        // Way faster to read directly from memory if we can.
        if (t._storeMemory && t._tables[ta]) {
            let rows = t._tables[ta]._rows;
            if (row === "all" || typeof row === "function") {
                let allRows = Object.keys(rows).map(r => rows[r]);
                if (row === "all") {
                    callBack(allRows.filter((r) => r));
                } else {
                    callBack(allRows.filter((r) => row(r)));
                }
            } else {
                callBack([rows[row]].filter((r) => r));
            }
            return;
        }

        switch (t._mode) {
            case 1: // IndexedDB
                const transaction = t._indexedDB.transaction(tableName, "readonly");
                const store = transaction.objectStore(tableName);
                if (row === "all" || typeof row === "function") {
                    let cursorRequest = store.openCursor();
                    let rows: any[] = [];
                    transaction.oncomplete = () => {
                        callBack(rows);
                    };

                    cursorRequest.onsuccess = (evt: any) => {
                        let cursor = evt.target.result;
                        if (cursor) {
                            if (row !== "all") {
                                if (row(cursor.value)) rows.push(cursor.value);
                            } else {
                                rows.push(cursor.value);
                            }
                            cursor.continue();
                        }
                    };
                } else {
                    let singleReq = store.get(row);
                    singleReq.onsuccess = (event) => {
                        callBack([singleReq.result]);
                    };
                }
            break;
            case 2: // Local Storage
                if (row === "all" || typeof row === "function") {
                    let rows = t._tables[ta]._index.map((idx) => {
                        let item = localStorage.getItem(tableName + "-" + idx);
                        return item && item.length ? JSON.parse(item) : null;
                    });
                    if (row !== "all") {
                        callBack(rows.filter((r) => row(r)));
                    } else {
                        callBack(rows);
                    }
                } else {
                    let item = localStorage.getItem(tableName + "-" + row);
                    callBack([item && item.length ? JSON.parse(item) : null]);
                }
            break;
            /*case 3: // WebSQL
                const serialize = (row: DBRow) => {
                    row = _assign(row);
                    t._models[ta].forEach((val, i): void => {
                        if (val.type === "map" || val.type === "array") {
                            row[val.key] = JSON.parse(row[val.key]);
                        }
                        if (row[val.key] === "undefined") {
                            row[val.key] = undefined;
                        }
                    });
                    return row;
                }

                t._webSQL.transaction((tx) => {
                    if (row === "all" || typeof row === "function") {
                        tx.executeSql("SELECT * FROM " + tableName, [], (tx, result) => {
                            let rows: any[] = [];
                            let ptr = result.rows.length;
                            while (ptr--) {
                                rows.unshift(serialize(result.rows.item(ptr)));
                            }
                            if (row !== "all") {
                                callBack(rows.filter((r) => row(r)));
                            } else {
                                callBack(rows);
                            }
                        });
                    } else {
                        let pk = t._tables[ta]._pk;
                        tx.executeSql("SELECT * FROM " + tableName + " WHERE " + pk + " = ?", [row], (tx, result) => {
                            let r: any[] = [];
                            if (result.rows.length) {
                                r.push(serialize(result.rows.item(0)));
                            } else {
                                r.push(null);
                            }
                            callBack(r);
                        });
                    }
                });
            break;*/
            case 4: // Level Up

                if (row === "all" || typeof row === "function") {
                    let rows: any[] = [];
                    t._levelDBs[tableName].createValueStream()
                    .on("data", (data) => {
                        rows.push(JSON.parse(data));
                    })
                    .on("end", () => {
                        if (row !== "all") {
                            callBack(rows.filter((r) => row(r)));
                        } else {
                            callBack(rows);
                        }
                    });
                } else {
                    t._levelDBs[tableName].get(String(row), (err, data) => {
                        if (err) {
                            callBack([null]);
                        } else {
                            callBack([JSON.parse(data)]);
                        }
                    });
                }
            break;
        }
    }

    public _clearAll(callBack: Function): void {
        let t = this;
        t._savedArgs._onSuccess = callBack;
        t._savedArgs._onFail = () => {};
        switch (t._mode) {
            case 0:
                t.init(t._parent, t._savedArgs);
            break;
            case 1: // IndexedDB
                indexedDB.deleteDatabase(String(t._parent._databaseID)).onsuccess = function() {
                    t.init(t._parent, t._savedArgs);
                };
            break;
            case 2: // Local Storage
                localStorage.clear();
                t.init(t._parent, t._savedArgs);
            break;
            /*case 3: // WebSQL
                t._webSQLEmpty(() => {
                    t.init(t._parent, t._savedArgs);
                });
            break;*/
            /* NODE-START */
            case 4: // Level Up

            break;
            /* NODE-END */
        }
        if (callBack) callBack(true);
    }


    /**
     * Write or access utility options.
     *
     * @param {("r"|"w")} type
     * @param {string} key
     * @param {*} [value]
     * @returns
     *
     * @memberOf _NanoSQLDB
     */
    public _utility(type: "r"|"w", key: string, value?: any): any {
        if (type === "r") { // Read
            if (this._utilityTable[key]) {
                return this._utilityTable[key].value;
            } else {
                return null;
            }
        } else { // Write
            this._upsert(_str(0), key, {key: key, value: value});
            this._utility[key] = {
                key: key,
                value: value
            };
            return value;
        }
    }

    /**
     * Setup a new table.
     *
     * @param {string} tableName
     * @param {DataModel[]} dataModels
     * @returns {string}
     *
     * @memberOf _NanoSQL_Storage
     */
    public _newTable(tableName: string, dataModels: DataModel[]): string {
        let t = this;
        let ta = NanoSQLInstance._hash(tableName);

        t._models[ta] = dataModels;
        t._parent._queryCache[ta] = {};

        t._tables[ta] = {
            _pk: "",
            _pkType: "",
            _keys: [],
            _defaults: [],
            _name: tableName,
            _incriment: 1,
            _index: [],
            _rows: {}
        };

        // Discover primary keys for each table
        let i = t._models[ta].length;
        let keys: string[] = [];
        let defaults: any[] = [];
        while (i--) {
            const p = t._models[ta][i];
            t._tables[ta]._keys.unshift(p.key);
            t._tables[ta]._defaults[i] = p.default;
            if (p.props && p.props.indexOf("pk") >= 0) {
                t._tables[ta]._pk = p.key;
                t._tables[ta]._pkType = p.type;
            }
        }

        return tableName;
    }

    /**
     * User agent sniffing to discover if we're running in Safari
     *
     * @returns
     *
     * @memberOf _NanoSQLDB
     */
    public _safari() {
        return typeof navigator !== "undefined" && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    }

    /**
     * User agent sniffing to discover if we're on an iOS device.
     *
     * @returns {boolean}
     *
     * @memberOf _NanoSQLDB
     */
    public _iOS(): boolean {

        let iDevices = [
            "iPad",
            "iPhone",
            "iPod"
        ];

        if (typeof navigator !== "undefined" && !!navigator.platform) {
            while (iDevices.length) {
                if (navigator.platform.indexOf(iDevices.pop() as string) !== -1) return true;
            }
        }

        return false;
    }
}