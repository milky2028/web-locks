/*************************************************************************
 *
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2023 Adobe Systems Incorporated
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe Systems Incorporated and its suppliers,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to Adobe Systems Incorporated and its
 * suppliers and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe Systems Incorporated.
 **************************************************************************/

const IndexedDBDataAccess = (function () {
    const COMP_NAME = "IndexedDBDataAccess";

    const ACPLNotifyAsyncFuncFailed = Module.cwrap('ACPLNotifyAsyncFuncFailed', null, ['number'])
    const ACPLNotifyAsyncFuncCompletedWithRetVal = Module.cwrap('ACPLNotifyAsyncFuncCompletedWithRetVal', null, ['number', 'number'])
    const ACPLNotifyAsyncFuncCompleted = Module.cwrap('ACPLNotifyAsyncFuncCompleted', null, ['number'])
    const ACPLNotifyAsyncFuncFailedWithRetVal = Module.cwrap('ACPLNotifyAsyncFuncFailedWithRetVal', null, ['number', 'number'])

    const idbConfig = {
            databaseInfo : {
                databaseName: "acplLiteDB",
                databaseVersion: 5 // We must increase the version if we make any schema change
            },
            ActiveAssetsTblInfo: {
                name: "Active_Assets_Tbl",
                keyName: ["assetId", "sessionId"],
                assetIdIndex: {
                    name: "assetIdIndex",
                    keyPath: "assetId",
                    option: { "unique": false }
                },
                sessionIdIndex: {
                    name: "sessionIdIndex",
                    keyPath: "sessionId",
                    option: { "unique": false }
                }
            },
            AssetsTblInfo : {
                name: "Assets_Tbl",
                keyName: ["userId", "sandboxPath"],
                assetIndex: {
                    name: "assetIndex",
                    keyPath: "assetId",
                    option: { "unique": false }
                },
                sandboxPathIndex: {
                    name: "sandboxPathIndex",
                    keyPath: "sandboxPath",
                    option: { "unique": true }
                },
                userHeartbeatIndex: {
                    name: "userHeartbeatIndex",
                    keyPath: ["userId", "lastHeartbeatTimeStamp"],
                    option: { "unique": false }
                },
                userModifiedTimeIndex: {
                    name: "userModifiedTimeIndex",
                    keyPath: ["userId", "localFileStateInfo.timeStamp"],
                    option: { "unique": false }
                }
            }
    }

    //! This function must be updated if any schema change happens. This must use shema of latest version
    //  to initialize the database. This function will be used to create the database for the first time.
    function _initializeDatabase(request) {
        if (!request) {
            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "_initializeDatabase: _request invalid");
            return;
        }

        try {
            ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "_initializeDatabase: Database initialization started for version", idbConfig.databaseInfo.databaseVersion);
            idbHandle = request.result;
            ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "_initializeDatabase: create objectstores", idbConfig.ActiveAssetsTblInfo.name);
            activeAssetObjectStore = idbHandle.createObjectStore(idbConfig.ActiveAssetsTblInfo.name, 
                                                                    { keyPath : idbConfig.ActiveAssetsTblInfo.keyName });

            ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "_initializeDatabase: create objectstores", idbConfig.AssetsTblInfo.name);
            assetObjectStore = idbHandle.createObjectStore(idbConfig.AssetsTblInfo.name, 
                                                            { keyPath : idbConfig.AssetsTblInfo.keyName });
            if (!activeAssetObjectStore || !assetObjectStore) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "_initializeDatabase failed in creating objectStores");
                return false;
            }
            activeAssetObjectStore.createIndex(idbConfig.ActiveAssetsTblInfo.assetIdIndex.name,
                                                idbConfig.ActiveAssetsTblInfo.assetIdIndex.keyPath,
                                                idbConfig.ActiveAssetsTblInfo.assetIdIndex.option);

            activeAssetObjectStore.createIndex(idbConfig.ActiveAssetsTblInfo.sessionIdIndex.name,
                                                idbConfig.ActiveAssetsTblInfo.sessionIdIndex.keyPath,
                                                idbConfig.ActiveAssetsTblInfo.sessionIdIndex.option);

            assetObjectStore.createIndex(idbConfig.AssetsTblInfo.assetIndex.name,
                                            idbConfig.AssetsTblInfo.assetIndex.keyPath,
                                            idbConfig.AssetsTblInfo.assetIndex.option);

            assetObjectStore.createIndex(idbConfig.AssetsTblInfo.sandboxPathIndex.name,
                                            idbConfig.AssetsTblInfo.sandboxPathIndex.keyPath,
                                            idbConfig.AssetsTblInfo.sandboxPathIndex.option);

            assetObjectStore.createIndex(idbConfig.AssetsTblInfo.userHeartbeatIndex.name,
                                            idbConfig.AssetsTblInfo.userHeartbeatIndex.keyPath,
                                            idbConfig.AssetsTblInfo.userHeartbeatIndex.option);
            assetObjectStore.createIndex(idbConfig.AssetsTblInfo.userModifiedTimeIndex.name,
                                            idbConfig.AssetsTblInfo.userModifiedTimeIndex.keyPath,
                                            idbConfig.AssetsTblInfo.userModifiedTimeIndex.option);

            ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "_initializeDatabase: Database initialization completed with version", idbConfig.databaseInfo.databaseVersion);
        } catch (e) {
            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "_initializeDatabase: Aborting transaction due to exception", e);
            request.transaction.abort();
            return;
        }
    }

    // All upgrade function definition must be in below format
    function _upgradeDatabaseFromVersion1(txn, upgradeFns) {
        ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "_upgradeDatabaseFromVersion1: Database migration from version 1 to version 2");
        function updateRecords(records) {
            try {
                let updatedRecords = [];
                for (rec of records) {
                    rec["syncFlag"] = 0;
                    updatedRecords.push(rec);
                }
                return updatedRecords;
            } catch (e) {
                console.error(e)
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "_upgradeDatabaseFromVersion1: updateRecords: Aborting transaction due to exception", e);
                txn.abort()
                return; // return undefined
            }
        }

        IndexedDBHandler.updatePropertiesInAllRecords(txn, upgradeFns, idbConfig.ActiveAssetsTblInfo.name, updateRecords);
    }

    _upgradeDatabaseFromVersion1({}, {})

    function _upgradeDatabaseFromVersion2(txn, upgradeFns) {
        ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "_upgradeDatabaseFromVersion2: Database migration from version 2 to version 3");
        function updateRecords(records) {
            try {
                let updatedRecords = [];
                for (rec of records) {
                    rec["repoState"] = Module.AssetRepoState.Unknown.value;
                    updatedRecords.push(rec);
                }
                return updatedRecords;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "_upgradeDatabaseFromVersion2: updateRecords: Aborting transaction due to exception", e);
                txn.abort()
                return; // return undefined
            }
        }

        IndexedDBHandler.updatePropertiesInAllRecords(txn, upgradeFns, idbConfig.AssetsTblInfo.name, updateRecords);
    }

    function _upgradeDatabaseFromVersion3(txn, upgradeFns) {
        try {
            ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "_upgradeDatabaseFromVersion3: Database migration from version 3 to version 4");
            const activeAssetObjectStore = txn.objectStore(idbConfig.ActiveAssetsTblInfo.name);
            const assetObjectStore = txn.objectStore(idbConfig.AssetsTblInfo.name);
            if (!activeAssetObjectStore || !assetObjectStore) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "failed to get objectStores");
                txn.abort();
                return;
            }
            // Delete old indexes from Active_Assets_Tbl
            let oldActiveAssetIdxs = activeAssetObjectStore.indexNames;
            for (let idx of oldActiveAssetIdxs) {
                ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "_upgradeDatabaseFromVersion3: Deleting Active_Assets_Tbl index", idx);
                activeAssetObjectStore.deleteIndex(idx);
            }

            // Delete old indexes from Assets_Tbl
            let oldAssetIdxs = assetObjectStore.indexNames;
            for (let idx of oldAssetIdxs) {
                ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "_upgradeDatabaseFromVersion3: Deleting Assets_Tbl index", idx);
                assetObjectStore.deleteIndex(idx);
            }

            activeAssetObjectStore.createIndex(idbConfig.ActiveAssetsTblInfo.assetIdIndex.name,
                                                idbConfig.ActiveAssetsTblInfo.assetIdIndex.keyPath,
                                                idbConfig.ActiveAssetsTblInfo.assetIdIndex.option);

            activeAssetObjectStore.createIndex(idbConfig.ActiveAssetsTblInfo.sessionIdIndex.name,
                                                idbConfig.ActiveAssetsTblInfo.sessionIdIndex.keyPath,
                                                idbConfig.ActiveAssetsTblInfo.sessionIdIndex.option);

            assetObjectStore.createIndex(idbConfig.AssetsTblInfo.assetIndex.name,
                                            idbConfig.AssetsTblInfo.assetIndex.keyPath,
                                            idbConfig.AssetsTblInfo.assetIndex.option);

            assetObjectStore.createIndex(idbConfig.AssetsTblInfo.sandboxPathIndex.name,
                                            idbConfig.AssetsTblInfo.sandboxPathIndex.keyPath,
                                            idbConfig.AssetsTblInfo.sandboxPathIndex.option);

            assetObjectStore.createIndex(idbConfig.AssetsTblInfo.userHeartbeatIndex.name,
                                            idbConfig.AssetsTblInfo.userHeartbeatIndex.keyPath,
                                            idbConfig.AssetsTblInfo.userHeartbeatIndex.option);
            assetObjectStore.createIndex(idbConfig.AssetsTblInfo.userModifiedTimeIndex.name,
                                            idbConfig.AssetsTblInfo.userModifiedTimeIndex.keyPath,
                                            idbConfig.AssetsTblInfo.userModifiedTimeIndex.option);
        } catch (e) {
            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "_upgradeDatabaseFromVersion3: Aborting transaction due to exception", e);
            txn.abort();
            return;
        }
    }

    function _upgradeDatabaseFromVersion4(txn, upgradeFns) {
        ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "_upgradeDatabaseFromVersion4: Database migration from version 4 to version 5");

        let deletedAssets = [];
        function removeRecordsAssetsTblFn(records) {
            try {
                let deleteAssetKeys = [];
                for (rec of records) {
                    if (!rec.mediaType.endsWith("+dcx")) {
                        // This is a non-composite asset, we will remove this entry
                        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "_upgradeDatabaseFromVersion4: Non composite asset with assetId " + rec.assetId);
                        deleteAssetKeys.push([rec.userId, rec.sandboxPath]);
                        deletedAssets.push(rec.assetId); // Save the assetId as we may need to remove the entries from active assets table with same assetId
                        continue;
                    }
                }
                return deleteAssetKeys;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "_upgradeDatabaseFromVersion4: updateRecords: Aborting transaction due to exception", e);
                txn.abort()
                return; // return undefined
            }
        }

        function removeRecordsActiveAssetsTblFn(records) {
            try {
                let deleteAssetKeys = [];
                for (rec of records) {
                    if (deletedAssets.includes(rec.assetId)) {
                        // This is assetId of non-composite asset, we will remove this entry
                        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "_upgradeDatabaseFromVersion4: Non composite asset with assetId " + rec.assetId);
                        deleteAssetKeys.push([rec.assetId, rec.sessionId]);
                        continue;
                    }
                }
                return deleteAssetKeys;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "_upgradeDatabaseFromVersion4: updateRecords: Aborting transaction due to exception", e);
                txn.abort()
                return; // return undefined
            }
        }

        // we need to first remove the records from Assets_Tbl and then from Active_Assets_Tbl.
        // Hence, we will create a chain of functions to remove the records.
        function nextUpgradeFn(txn, upgradeFns) {
            IndexedDBHandler.removeRecords(txn, upgradeFns, idbConfig.ActiveAssetsTblInfo.name, removeRecordsActiveAssetsTblFn);
        }
        upgradeFns.push(nextUpgradeFn);

        IndexedDBHandler.removeRecords(txn, upgradeFns, idbConfig.AssetsTblInfo.name, removeRecordsAssetsTblFn)
    }

    function _successCb(event) {
        ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "_successCb: Database open succeeded", event);
    }

    //! This function needs to be updated if any schema change happens. In case of any schema change, we will add
    //  new migration function that will migrate the database from it's previous version and that function needs to
    //  be added in the upgradeFns array.
    function _upgradeCb(event) {
        try {
            if (0 == event.oldVersion) {
                // version 0 means that the client had no database
                // perform initialization
                ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "_upgradeCb: Database initialization required", );
                _initializeDatabase(event.target);
            } else {
                //! Order of the these function must be in reverse order like below
                // let upgradeFns = [_upgradeDatabaseFromVersion3, _upgradeDatabaseFromVersion2, _upgradeDatabaseFromVersion1];
                let upgradeFns = [_upgradeDatabaseFromVersion4, _upgradeDatabaseFromVersion3, _upgradeDatabaseFromVersion2, _upgradeDatabaseFromVersion1];
                if (upgradeFns.length != event.newVersion - 1) {
                    ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "_upgradeCb: Aborting the transaction due to invalid migration steps");
                    event.target.transaction.abort()
                }
                let count = 1;
                while (count++ < event.oldVersion) {
                    upgradeFns.pop(); // pop the migration function till last used version
                }
                let fn = upgradeFns.pop();
                fn(event.target.transaction, upgradeFns);
                ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "_upgradeCb: Database upgrade required");
            }
        } catch (e) {
            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "_upgradeCb: Aborting the transaction due to exception", e);
            event.target.transaction.abort();
        }
    }

    function _errorCb(event) {
        ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "IndexedDBDataAccess::_errorCb: Error callback called ", event.target.result);
    }

    function _versionChangeCb(event) {
        ACPLJSLogger.log(LogLevels.WAR, COMP_NAME, "_versionChangeCb: Database is outdated, please reload the page.");
        Module.versionChangeCb(event.oldVersion, ((event.newVersion)? event.newVersion: 0))
    }

    /**
     * @brief Opens the IndexedDB database and create the objectstore if required.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
     */
    function open(asyncInfoAddr) {
        try {
            ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "open: opening database");
            IndexedDBHandler.open(idbConfig.databaseInfo, _successCb, _upgradeCb, _versionChangeCb, _errorCb, asyncInfoAddr);
        } catch (e) {
            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "open: Database open failed with exception", e);
            ACPLNotifyAsyncFuncFailedWithRetVal(asyncInfoAddr, Module.IdbJSErrorCode.InvalidConfig.value);
        }
    }

    /**
     * @brief Closes the IndexedDB database.
     */
    function close() {
        ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "close: closing database");
        IndexedDBHandler.close();
    }

    /**
     * @brief Create an entry in the Active_Assets_Tbl.
     * @param jsonData Serialized json string of active asset.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function createOrReplaceActiveAssetEntry(jsonData, asyncInfoAddr) {
        try {
            let newItem = JSON.parse(jsonData);
            ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "createOrReplaceActiveAssetEntry: create record ", newItem);
            IndexedDBHandler.insertRecord(idbConfig.ActiveAssetsTblInfo.name, newItem, true/*create or replace*/, asyncInfoAddr);
        } catch (e) {
            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "createOrReplaceActiveAssetEntry: failed with exception", e);
            ACPLNotifyAsyncFuncFailedWithRetVal(asyncInfoAddr, Module.IdbJSErrorCode.Unknown.value);
        }
    }

    /**
     * @brief Remove an entry from the Active_Assets_Tbl.
     * @param assetId The asset id.
     * @param sessionId The session id.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function removeActiveAssetEntry(assetId, sessionId, asyncInfoAddr) {
        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "removeActiveAssetEntry: remove record with assetId =", assetId,
                         "sessionId =", sessionId);
        IndexedDBHandler.removeRecord(idbConfig.ActiveAssetsTblInfo.name, [assetId, sessionId], asyncInfoAddr);
    }

    /**
     * @brief Removes all entry from the Active_Assets_Tbl.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function clearActiveAssets(asyncInfoAddr) {
        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "clearActiveAssets: clear all records");
        IndexedDBHandler.clearRecords(idbConfig.ActiveAssetsTblInfo.name, asyncInfoAddr);
    }

    /**
     * @brief Retrieve the record from the Active_Assets_Tbl for a specific assetId and sessionId.
     * @param assetId The asset id for which data will be retrieved.
     * @param sessionId The session id in which the asset was opened.
     * @param stringPtr Address of serialize ActiveAssetRecord string. This is the output parameter.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function getActiveAsset(assetId, sessionId, stringPtr, asyncInfoAddr) {
        function processRecordCb(record) {
            try {
                Module.populateString(stringPtr, JSON.stringify(record));
                ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getActiveAsset: processRecordCb: fetched record", record);
                return true;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "getActiveAsset: processRecordsCb: failed with exception", e);
                return false;
            }
        }

        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getActiveAsset: fetch record for assetId =", assetId,
                         "sessionId =", sessionId);
        IndexedDBHandler.getRecord(idbConfig.ActiveAssetsTblInfo.name, [assetId, sessionId], processRecordCb, asyncInfoAddr);
    }

    /**
     * @brief Retrieve records from the Active_Assets_Tbl.
     * @param indexInfo Index name and value object.
     * @param stringPtr Address of serialize ActiveAssetRecord list string. This is the output parameter.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function getActiveAssetList(indexInfo, stringPtr, asyncInfoAddr) {
        function processRecordCb(record) {
            try {
                Module.populateString(stringPtr, JSON.stringify(record));
                ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getActiveAssetList: processRecordCb: fetched record", record);
                return true;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "getActiveAssetList: processRecordsCb: failed with exception", e);
                return false;
            }
        }

        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getActiveAssetList: fetching active records");
        if (undefined != indexInfo) {
            IndexedDBHandler.getRecordsByIndex(idbConfig.ActiveAssetsTblInfo.name, indexInfo, processRecordCb, asyncInfoAddr);
        } else {
            IndexedDBHandler.getAllRecords(idbConfig.ActiveAssetsTblInfo.name, processRecordCb, asyncInfoAddr);
        }
    }

    /**
     * @brief Retrieve all records from the Active_Assets_Tbl.
     * @param stringPtr Address of serialize ActiveAssetRecord list string. This is the output parameter.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function getAllActiveAssets(stringPtr, asyncInfoAddr) {
        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getAllActiveAssets: fetching all active records");
        var indexInfo;
        getActiveAssetList(indexInfo, stringPtr, asyncInfoAddr);
    }

    /**
     * @brief Retrieve all records from the Active_Assets_Tbl for a specific asset id.
     * @param assetId The asset id.
     * @param stringPtr Address of serialize ActiveAssetRecord list string. This is the output parameter.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function getActiveAssetsByAssetID(assetId, stringPtr, asyncInfoAddr) {
        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getActiveAssetsByAssetID: fetching active records for aseetId =", assetId);
        var indexInfo = {
            name: idbConfig.ActiveAssetsTblInfo.assetIdIndex.name,
            range: IDBKeyRange.only(assetId),
            direction: 'next'
        };
        getActiveAssetList(indexInfo, stringPtr, asyncInfoAddr);
    }

    /**
     * @brief Retrieve all records from the Active_Assets_Tbl for a specific session id.
     * @param sessionId The session id.
     * @param stringPtr Address of serialize ActiveAssetRecord list string. This is the output parameter.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function getActiveAssetsBySessionID(sessionId, stringPtr, asyncInfoAddr) {
        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getActiveAssetsBySessionID: fetching active records for sessionId =", sessionId);
        var indexInfo = {
            name: idbConfig.ActiveAssetsTblInfo.sessionIdIndex.name,
            range: IDBKeyRange.only(sessionId),
            direction: 'next'
        };
        getActiveAssetList(indexInfo, stringPtr, asyncInfoAddr);
    }

    /**
     * @brief Create an entry in the Assets_Tbl.
     * @param jsonData Serialized json string of asset.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
     * @return Returns 'true' if the new entry is created successfully, otherwise 'false'.
    */
    function createAssetEntry(jsonData, asyncInfoAddr) {
        try {
            let newItem = JSON.parse(jsonData);
            ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "createAssetEntry: create asset entry", newItem);
            IndexedDBHandler.insertRecord(idbConfig.AssetsTblInfo.name, newItem, false/*create only*/, asyncInfoAddr);
        } catch (e) {
            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "createAssetEntry: failed with exception", e);
            ACPLNotifyAsyncFuncFailedWithRetVal(asyncInfoAddr, Module.IdbJSErrorCode.Unknown.value);
        }
    }

    /**
     * @brief Removes an entry from the Assets_Tbl.
     * @param userId The user id.
     * @param sandboxPath The sandbox path of the asset to be removed.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function removeAssetEntry(userId, sandboxPath, asyncInfoAddr) {
        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "removeAssetEntry: remove asset entry for userId =", userId,
                         "sandboxPath =", sandboxPath);
        IndexedDBHandler.removeRecord(idbConfig.AssetsTblInfo.name, [userId, sandboxPath], asyncInfoAddr);
    }

    /**
     * @brief Removes all entry from the Assets_Tbl.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function clearAssets(asyncInfoAddr) {
        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "clearAssets: clear all records");
        IndexedDBHandler.clearRecords(idbConfig.AssetsTblInfo.name, asyncInfoAddr);
    }

    /**
     * @brief Update the local file state(state and timestamp) in the Assets_Tbl.
     * @param userId The user id.
     * @param sandboxPath The sandbox path of the asset to be removed.
     * @param localTimeStamp Local timestamp of the asset.
     * @param localState Local asset state.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function updateLocalFileStateInfo(userId, sandboxPath, localTimeStamp, localState, asyncInfoAddr) {
        function updateRecordCb(record) {
            try {
                record.localFileStateInfo.state = localState;
                record.localFileStateInfo.timeStamp = localTimeStamp;
                return record;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "updateRecordCb: failed with exception", e);
                return; // return undefined
            }
        }

        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "updateLocalFileStateInfo: update record for userId =", userId,
                         "sandboxPath =", sandboxPath, "to new localState =", localState, "localTimeStamp", localTimeStamp);
        IndexedDBHandler.updateRecord(idbConfig.AssetsTblInfo.name, [userId, sandboxPath],
                                        updateRecordCb, asyncInfoAddr);
    }

    /**
     * @brief Update the remote file state(state and timestamp) in the Assets_Tbl.
     * @param userId The user id.
     * @param sandboxPath The sandbox path of the asset to be removed.
     * @param remoteTimeStamp Remote timestamp of the asset.
     * @param remoteState Remote asset state.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function updateRemoteFileStateInfo(userId, sandboxPath, remoteTimeStamp, remoteState, asyncInfoAddr) {
        function updateRecordCb(record) {
            try {
                record.remoteFileStateInfo.state = remoteState;
                record.remoteFileStateInfo.timeStamp = remoteTimeStamp;
                return record;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "updateRecordCb: failed with exception", e);
                return; // return undefined
            }
        }

        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "updateRemoteFileStateInfo: update record for userId =", userId,
                         "sandboxPath =", sandboxPath, "to new remoteState =", remoteState, "remoteTimeStamp", remoteTimeStamp);
        IndexedDBHandler.updateRecord(idbConfig.AssetsTblInfo.name, [userId, sandboxPath],
                                        updateRecordCb, asyncInfoAddr);
    }

    /**
     * @brief Update the local file timestamp in the Assets_Tbl.
     * @param userId The user id.
     * @param sandboxPath The sandbox path of the asset to be removed.
     * @param timeStamp Local timestamp of the asset.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function updateLocalFileTimeStamp(userId, sandboxPath, timeStamp, asyncInfoAddr) {
        function updateRecordCb(record) {
            try {
                record.localFileStateInfo.timeStamp = timeStamp;
                return record;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "updateRecordCb: failed with exception", e);
                return; // return undefined
            }
        }

        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "updateLocalFileTimeStamp: update record for userId =", userId,
                         "sandboxPath =", sandboxPath, "to new localTimeStamp =", timeStamp);
        IndexedDBHandler.updateRecord(idbConfig.AssetsTblInfo.name, [userId, sandboxPath],
                                        updateRecordCb, asyncInfoAddr);
    }

    /**
     * @brief Update the local file timestamp in the Assets_Tbl if the local timestamp is same as lastTS.
     * @param userId The user id.
     * @param sandboxPath The sandbox path of the asset to be removed.
     * @param updatedTS Updated local timestamp of the asset.
     * @param lastTS Last local timestamp of the asset.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function updateLocalFileTimeStampIfNotChanged(userId, sandboxPath, updatedTS, lastTS, asyncInfoAddr) {
        function updateRecordCb(record) {
            try {
                if (record.localFileStateInfo.timeStamp == lastTS) {
                    record.localFileStateInfo.timeStamp = updatedTS;
                }
                return record;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "updateRecordCb: failed with exception", e);
                return; // return undefined
            }
        }

        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "updateLocalFileTimeStampIfNotChanged: update record for userId =", userId,
                         "sandboxPath =", sandboxPath, "lastTs =", lastTS, "updatedTS =", updatedTS);
        IndexedDBHandler.updateRecord(idbConfig.AssetsTblInfo.name, [userId, sandboxPath],
                                        updateRecordCb, asyncInfoAddr);
    }

    /**
     * @brief Update the local file timestamp in the Assets_Tbl if the local timestamp is same as lastTS.
     * @param userId The user id.
     * @param sandboxPath The sandbox path of the asset to be removed.
     * @param lastTS Last local timestamp of the asset.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function updateLocalFileTimeStampWithLastSyncTimeStampIfNotChanged(userId, sandboxPath, lastTS, asyncInfoAddr) {
        function updateRecordCb(record) {
            try {
                if (record.localFileStateInfo.timeStamp == lastTS) {
                    record.localFileStateInfo.timeStamp = record.lastSyncTimeStamp;
                }
                return record;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "updateRecordCb: failed with exception", e);
                return; // return undefined
            }
        }

        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "updateLocalFileTimeStampWithLastSyncTimeStampIfNotChanged: update record for userId =", userId,
                         "sandboxPath =", sandboxPath, "lastTs =", lastTS);
        IndexedDBHandler.updateRecord(idbConfig.AssetsTblInfo.name, [userId, sandboxPath],
                                        updateRecordCb, asyncInfoAddr);
    }

    /**
     * @brief Update the remote file timestamp in the Assets_Tbl.
     * @param userId The user id.
     * @param sandboxPath The sandbox path of the asset to be removed.
     * @param timeStamp Remote timestamp of the asset.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function updateRemoteFileTimeStamp(userId, sandboxPath, timeStamp, asyncInfoAddr) {
        function updateRecordCb(record) {
            try {
                record.remoteFileStateInfo.timeStamp = timeStamp;
                return record;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "updateRecordCb: failed with exception", e);
                return; // return undefined
            }
        }

        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "updateRemoteFileTimeStamp: update record for userId =", userId,
                         "sandboxPath =", sandboxPath, "to new remoteTimeStamp =", timeStamp);
        IndexedDBHandler.updateRecord(idbConfig.AssetsTblInfo.name, [userId, sandboxPath],
                                        updateRecordCb, asyncInfoAddr);
    }

    /**
     * @brief Update the last sync timestamp in the Assets_Tbl.
     * @param userId The user id.
     * @param sandboxPath The sandbox path of the asset to be removed.
     * @param lastSyncTimeStamp Updated last sync time.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function updateAssetLastSyncTimeStamp(userId, sandboxPath, lastSyncTimeStamp, asyncInfoAddr) {
        function updateRecordCb(record) {
            try {
                record.lastSyncTimeStamp = lastSyncTimeStamp;
                return record;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "updateRecordCb: failed with exception", e);
                return; // return undefined
            }
        }

        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "updateAssetLastSyncTimeStamp: update record for userId =", userId,
                         "sandboxPath =", sandboxPath, "to new lastSyncTimeStamp =", lastSyncTimeStamp);
        IndexedDBHandler.updateRecord(idbConfig.AssetsTblInfo.name, [userId, sandboxPath],
                                        updateRecordCb, asyncInfoAddr);
    }

    /**
     * @brief Update the last heartbeat timestamp in the Assets_Tbl.
     * @param userId The user id.
     * @param sandboxPath The sandbox path of the asset to be removed.
     * @param lastHeartbeatTimeStamp Updated last heartbeat time.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function updateAssetLastHeartbeatTimeStamp(userId, sandboxPath, lastHeartbeatTimeStamp, asyncInfoAddr) {
        function updateRecordCb(record) {
            try {
                record.lastHeartbeatTimeStamp = lastHeartbeatTimeStamp;
                return record;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "updateRecordCb: failed with exception", e);
                return; // return undefined
            }
        }

        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "updateAssetLastHeartbeatTimeStamp: update record with userId =", userId
                         ,"sandboxPath =", sandboxPath, "to new heartbeat time =", lastHeartbeatTimeStamp);
        IndexedDBHandler.updateRecord(idbConfig.AssetsTblInfo.name, [userId, sandboxPath],
                                        updateRecordCb, asyncInfoAddr);
    }

    /**
     * Sets the conflict information for an asset and its conflicted copy asset in the Assets_Tbl.
     *
     * @param {string} userId - The ID of the user.
     * @param {string} originalSandboxPath - The sandbox path of the original asset.
     * @param {string} conflictedCopySandboxPath - The sandbox path of the conflicted copy asset.
     * @param {string} asyncInfoAddr - The address of the asynchronous information.
     */
    function setAssetConflictInfo(userId, originalSandboxPath, conflictedCopySandboxPath, asyncInfoAddr) {
        function operationsFn(txnData) {
            try {
                let store = txnData.txn.objectStore(idbConfig.AssetsTblInfo.name);
                // fetch the original asset from asset table
                let origGetRequest = store.get([userId, originalSandboxPath]);
                origGetRequest.onsuccess = function(origGetRequestEvent) {
                    // if original asset not found, abort the transaction, no need to update the conflict info in conflicted copy asset
                    if (!origGetRequestEvent.target.result) {
                        ACPLJSLogger.log(LogLevels.WAR, COMP_NAME, "setAssetConflictInfo: Aborting the transaction as original asset not found in ", idbConfig.AssetsTblInfo.name);
                        txnData.abortErrorCode = Module.IdbJSErrorCode.NotFoundError.value;
                        txnData.txn.abort();
                        return;
                    }

                    let origAsset = origGetRequestEvent.target.result;

                    // fetch the conflicted copy asset from asset table
                    let conflictedCopyGetRequest = store.get([userId, conflictedCopySandboxPath]);
                    conflictedCopyGetRequest.onsuccess = function(conflictedCopyGetRequestEvent) {
                        // if conflicted copy asset not found, abort the transaction, no need to update the conflict info in original asset
                        if (!conflictedCopyGetRequestEvent.target.result) {
                            ACPLJSLogger.log(LogLevels.WAR, COMP_NAME, "setAssetConflictInfo: Aborting the transaction as conflicted copy asset not found in ", idbConfig.AssetsTblInfo.name);
                            txnData.abortErrorCode = Module.IdbJSErrorCode.NotFoundError.value;
                            txnData.txn.abort();
                            return;
                        }

                        let conflictedCopyAsset = conflictedCopyGetRequestEvent.target.result;

                        // update the conflict info in original and conflicted copy asset
                        origAsset["assetConflictInfo"] = {
                            assetConflictState: Module.AssetConflictState.Original.value,
                            associatedAssetId: conflictedCopyAsset.assetId,
                            associatedAssetLocalStoragePath: conflictedCopyAsset.sandboxPath
                        };

                        conflictedCopyAsset["assetConflictInfo"] = {
                            assetConflictState: Module.AssetConflictState.ConflictedCopy.value,
                            associatedAssetId: origAsset.assetId,
                            associatedAssetLocalStoragePath: origAsset.sandboxPath
                        };

                        // update the original asset in asset table
                        store.put(origAsset).onsuccess = function(origAssetPutEvent) {
                            if (!origAssetPutEvent.target.result) {
                                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "setAssetConflictInfo: Aborting the transaction as original asset not found in putRequest in", idbConfig.AssetsTblInfo.name);
                                txnData.abortErrorCode = Module.IdbJSErrorCode.NotFoundError.value;
                                txnData.txn.abort();
                            }
                        }

                        // update the conflicted copy asset in asset table
                        store.put(conflictedCopyAsset).onsuccess = function(conflictedCopyAssetPutEvent) {
                            if (!conflictedCopyAssetPutEvent.target.result) {
                                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "setAssetConflictInfo: Aborting the transaction as conflicted copy asset not found in putRequest in", idbConfig.AssetsTblInfo.name);
                                txnData.abortErrorCode = Module.IdbJSErrorCode.NotFoundError.value;
                                txnData.txn.abort();
                            }
                        }
                    }
                }
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "setAssetConflictInfo: failed with exception", e);
                txnData.txn.abort();
                return; // return undefined
            }
        }

        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "setAssetConflictInfo: set conflict info for userId =", userId,
                         "originalSandboxPath =", originalSandboxPath, "conflictedCopySandboxPath =", conflictedCopySandboxPath);
        IndexedDBHandler.excecuteOperations(idbConfig.AssetsTblInfo.name, IDBTransactionMode.READ_WRITE, operationsFn, "setAssetConflictInfo", asyncInfoAddr);
    }

    /**
     * Clears the conflict information for a specific asset and its conflicted copy/original asset in the Assets_Tbl.
     * 
     * @param {string} userId - The ID of the user.
     * @param {string} sandboxPath - The sandbox path of the asset.
     * @param {string} asyncInfoAddr - The address of the asynchronous information.
     */
    function clearAssetConflictInfo(userId, sandboxPath, asyncInfoAddr) {
        function operationsFn(txnData) {
            let store = txnData.txn.objectStore(idbConfig.AssetsTblInfo.name);
            // fetch the asset from asset table
            let getRequest = store.get([userId, sandboxPath]);
            getRequest.onsuccess = function(getRequestEvent) {
                // if asset not found, abort the transaction
                if (!getRequestEvent.target.result) {
                    ACPLJSLogger.log(LogLevels.WAR, COMP_NAME, "clearAssetConflictInfo: Aborting the transaction as asset not found in ", idbConfig.AssetsTblInfo.name);
                    txnData.abortErrorCode = Module.IdbJSErrorCode.NotFoundError.value;
                    txnData.txn.abort();
                    return;
                }

                let asset = getRequestEvent.target.result;
                let associatedAssetSandboxPath = undefined;
                if (asset.hasOwnProperty("assetConflictInfo")) {
                    associatedAssetSandboxPath = asset.assetConflictInfo.associatedAssetLocalStoragePath
                    // clear the conflict info in asset
                    delete asset.assetConflictInfo;

                    // update the asset in asset table
                    store.put(asset).onsuccess = function(assetPutEvent) {
                        if (!assetPutEvent.target.result) {
                            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "clearAssetConflictInfo: Aborting the transaction as asset not found in putRequest in", idbConfig.AssetsTblInfo.name);
                            txnData.abortErrorCode = Module.IdbJSErrorCode.NotFoundError.value;
                            txnData.txn.abort();
                        }
                    }
                }

                // if associated asset path is not empty, clear the conflict info in associated asset
                if (undefined != associatedAssetSandboxPath) {
                    let associatedAssetGetRequest = store.get([userId, associatedAssetSandboxPath]);
                    associatedAssetGetRequest.onsuccess = function(associatedAssetGetRequestEvent) {
                        // if associated asset not found, abort the transaction, no need to update the conflict info
                        if (associatedAssetGetRequestEvent.target.result) {

                            let associatedAsset = associatedAssetGetRequestEvent.target.result;

                            // clear the conflict info in associated asset
                            if (associatedAsset.hasOwnProperty("assetConflictInfo")) {
                                delete associatedAsset.assetConflictInfo;

                                // update the associated asset in asset table, no need to handle not found case.
                                store.put(associatedAsset);
                            }
                        }
                    }
                }
            }
        }

        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "clearAssetConflictInfo: clear conflict info for userId =", userId,
                         "sandboxPath =", sandboxPath);
        IndexedDBHandler.excecuteOperations(idbConfig.AssetsTblInfo.name, IDBTransactionMode.READ_WRITE, operationsFn, "clearAssetConflictInfo", asyncInfoAddr);
    }

    /**
     * @brief Create/Update an entry in the Assets_Tbl.
     * @param jsonData Serialized json string of asset.
     * @param updateOption Specific update option to update record.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
     * @return Returns 'true' if the new entry is created successfully, otherwise 'false'.
    */
    function createOrUpdateAssetEntry(jsonData, updateOption, asyncInfoAddr) {
        try {
            let newItem = JSON.parse(jsonData);
            ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "createOrUpdateAssetEntry: create/update record data", newItem);

            function foundCB(record) {
                try {
                    switch (updateOption) {
                        case Module.AssetUpdateOption.LocalFileStateInfo.value : {
                            record.localFileStateInfo = newItem.localFileStateInfo;
                            return record;
                        }
                        case Module.AssetUpdateOption.RemoteFileStateInfo.value : {
                            record.remoteFileStateInfo = newItem.remoteFileStateInfo;
                            return record;
                        }
                        case Module.AssetUpdateOption.LocalFileTimeStamp.value : {
                            record.localFileStateInfo.timeStamp = newItem.localFileStateInfo.timeStamp;
                            return record;
                        }
                        case Module.AssetUpdateOption.RemoteFileTimeStamp.value : {
                            record.remoteFileStateInfo.timeStamp = newItem.remoteFileStateInfo.timeStamp;
                            return record;
                        }
                        case Module.AssetUpdateOption.LastSyncTimeStamp.value : {
                            record.lastSyncTimeStamp = newItem.lastSyncTimeStamp;
                            return record;
                        }
                        case Module.AssetUpdateOption.LastHeartbeatTimeStamp.value : {
                            record.lastHeartbeatTimeStamp = newItem.lastHeartbeatTimeStamp;
                            return record;
                        }
                        case Module.AssetUpdateOption.All.value :
                        default:
                            return newItem;
                    }
                } catch (e) {
                    ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "createOrUpdateAssetEntry::foundCB: failed with exception", e);
                    return; // return undefined
                }
            }

            function notFoundCB() {
                if (updateOption == Module.AssetUpdateOption.All.value) {
                    return newItem;
                } else {
                    ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "createOrUpdateAssetEntry::notFoundCB: failed to find record, no entry is created.");
                    return; // return undefined
                }
            }

            ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "createOrUpdateAssetEntry: create/update asset entry", newItem.userId, newItem.sandboxPath, updateOption);
            IndexedDBHandler.createOrUpdateRecord(idbConfig.AssetsTblInfo.name, [newItem.userId, newItem.sandboxPath],
                                                    foundCB, notFoundCB, asyncInfoAddr);
        } catch (e) {
            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "createOrUpdateAssetEntry: failed with exception", e);
            ACPLNotifyAsyncFuncFailedWithRetVal(asyncInfoAddr, Module.IdbJSErrorCode.Unknown.value);
        }
    }

    /**
     * @brief Retrieve all records from the Active_Assets_Tbl for a specific index.
     * @param indexInfo Index name and value object.
     * @param stringPtr Address of serialize AssetRecord list string. This is the output parameter.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function getAssetsByIndex(indexInfo, stringPtr, asyncInfoAddr) {
        function processRecordCb(record) {
            try {
                Module.populateString(stringPtr, JSON.stringify(record));
                ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getAssetsByIndex: processRecordCb: fetched record", record);
                return true;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "getAssetsByIndex: processRecordCb: failed with exception", e);
                return false;
            }
        }

        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getAssetsByIndex: fetch record", indexInfo);
        IndexedDBHandler.getRecordsByIndex(idbConfig.AssetsTblInfo.name, indexInfo, processRecordCb, asyncInfoAddr);
    }

    /**
     * @brief Retrieve all records from the Active_Assets_Tbl for a specific asset id.
     * @param assetId The asset id.
     * @param stringPtr Address of serialize AssetRecord list string. This is the output parameter.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function getAssetsByAssetID(assetId, stringPtr, asyncInfoAddr) {
        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getAssetsByAssetID: fetch record for assetId =", assetId);
        var indexInfo = {
                            name: idbConfig.AssetsTblInfo.assetIndex.name,
                            range: IDBKeyRange.only(assetId),
                            direction: 'next'
                        };
        getAssetsByIndex(indexInfo, stringPtr, asyncInfoAddr);
    }

    /**
     * @brief Retrieve all records from the Active_Assets_Tbl for a specific user id.
     * @param userId The user id.
     * @param stringPtr Address of serialize AssetRecord list string. This is the output parameter.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function getAssetsByUserID(userId, sortOrderBy, sortOrder, stringPtr, asyncInfoAddr) {
        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getAssetsByUserID: fetch record for userId =", userId);
        var indexInfo = {
                            name: "",
                            range: IDBKeyRange.bound([userId], [userId, []]),
                            direction: (Module.SortOrder.Descending.value == sortOrder? 'prev': 'next')
                        };
        switch (sortOrderBy) {
            case Module.SortOrderBy.ModifiedTime.value: {
                indexInfo.name = idbConfig.AssetsTblInfo.userModifiedTimeIndex.name;
                break;
            }
            case Module.SortOrderBy.HeartBeatTime.value:
            default: {
                indexInfo.name = idbConfig.AssetsTblInfo.userHeartbeatIndex.name;
                break;
            }
        }
        getAssetsByIndex(indexInfo, stringPtr, asyncInfoAddr);
    }

    /**
     * @brief Retrieve the record from the Assets_Tbl for a specific user and sandbox path.
     * @param userId The user id for which data will be retrieved.
     * @param sandboxPath The sandbox path of the asset.
     * @param stringPtr Address of serialize AssetRecord string. This is the output parameter.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function getAsset(userId, sandboxPath, stringPtr, asyncInfoAddr) {
        function processRecordCb(record) {
            try {
                Module.populateString(stringPtr, JSON.stringify(record));
                ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getAsset: processRecordCb: fetched record", record);
                return true;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "getAsset: processRecordsCb: failed with exception", e);
                return false;
            }
        }

        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getAsset: fetch record for userId =", userId,
                         "sandboxPath =", sandboxPath);
        IndexedDBHandler.getRecord(idbConfig.AssetsTblInfo.name, [userId, sandboxPath], processRecordCb, asyncInfoAddr);
    }

    /**
     * @brief Retrieve last heartbeat time from the Assets_Tbl.
     * @param userId The user id for which data will be retrieved.
     * @param sandboxPath The sandbox path of the asset.
     * @param lastHeartbeatTimeStampPtr Address of std::string. This is the output parameter.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
    */
    function getLastHeartbeatTimeStamp(userId, sandboxPath, lastHeartbeatTimeStampPtr, asyncInfoAddr) {
        function processRecordCb(record) {
            try {
                Module.populateString(lastHeartbeatTimeStampPtr, record.lastHeartbeatTimeStamp);
                return true;
            } catch (e) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "processRecordsCb: failed with exception", e);
                return false;
            }
        }

        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getLastHeartbeatTimeStamp: fetch last heartbeat time for userId =", userId,
                         "sandboxPath =", sandboxPath);
        IndexedDBHandler.getRecord(idbConfig.AssetsTblInfo.name, [userId, sandboxPath], processRecordCb, asyncInfoAddr);
    }

    function isSandboxPathSecondary(sandboxPath) {
        return sandboxPath.includes("_");
    }

    /**
     * @brief Find and purge old cache records from asset and active aseet table
     * @param userId - user Id
     * @param sessionId - Session Id
     * @param threshold - Upper bound for heartbeat time threshold
     * @param secondaryThreshold - Upper bound for heartbeat time for secondaries.
     * @param maxCacheCount - The threshold for maximum cached assets count
     * @param stringPtr Address of serialize AssetRecord list string. This is the output parameter.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
     */
    function purgeAndGetOldCachedAssets(userId, sessionId, threshold, secondaryThreshold, maxCacheCount, stringPtr, asyncInfoAddr) {
        function operationsFn(txnData) {
            let purgedRecords = [];
            let cacheCount = 0;
            const assetObjectStore = txnData.txn.objectStore(idbConfig.AssetsTblInfo.name);
            const activeAssetObjectStore = txnData.txn.objectStore(idbConfig.ActiveAssetsTblInfo.name);

            // Purge after checking the last heartbeat time stamp
            function purgeAfterCheckingThreshold(cursor, isSecondaryPath) {
                const heartbeatTS   = cursor.value.lastHeartbeatTimeStamp;
                const lastSyncTS    = cursor.value.lastSyncTimeStamp;
                const localCommitTS = cursor.value.localFileStateInfo.timeStamp;
                let thresholdTime = isSecondaryPath ? secondaryThreshold : threshold;
                const assetMsg = isSecondaryPath ? "secondary asset:" : "asset:";
                if ((heartbeatTS && lastSyncTS && localCommitTS) && (heartbeatTS < thresholdTime) && (lastSyncTS == localCommitTS)) {
                    // Deep copy the record before deleting the cursor
                    const record = JSON.parse(JSON.stringify(cursor.value));
                    const request = cursor.delete();
                    request.onsuccess = () => {
                        ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "purgeAndGetOldCachedAssets Purged",  assetMsg, cursor.value.assetId, " from asset table");
                        purgedRecords.push(record);
                        activeAssetObjectStore.delete([cursor.value.assetId, sessionId]);
                        // clear the conflict info from its associated asset 
                        if (record.hasOwnProperty("assetConflictInfo")) {
                            assetObjectStore.get([record.userId, record.assetConflictInfo.associatedAssetLocalStoragePath]).onsuccess = function (getEvent) {
                                let associatedAsset = getEvent.target.result;
                                if (associatedAsset) {
                                    delete associatedAsset.assetConflictInfo;
                                    assetObjectStore.put(associatedAsset);
                                }
                            }
                        }
                    }
                }
            }

            const searchIndex = assetObjectStore.index(idbConfig.AssetsTblInfo.userHeartbeatIndex.name);
            const searchIndexCursor = searchIndex.openCursor(IDBKeyRange.bound([userId], [userId, []]), 'prev');

            searchIndexCursor.onsuccess = function (event) {
                try {
                    let cursor = event.target.result;
                    if (cursor) {
                        const sandboxPath   = cursor.value.sandboxPath;
                        // Synced secondaries not in open state will be removed
                        if (isSandboxPathSecondary(sandboxPath)) {
                            purgeAfterCheckingThreshold(cursor, true);
                        } else {
                            // For all assets which were last opened (last heartbeat time stamp) before the threshold time (24hrs), if they are synced, are possible candidates for purging.
                            // We will keep only the maxCacheCount assets in the cache irrespective of the fact that the asset can be purged or not. 
                            // More information about the logic for cache management can be found here: https://wiki.corp.adobe.com/x/_DqopQ
                            if(cacheCount >= maxCacheCount) {
                                purgeAfterCheckingThreshold(cursor, false);
                            } else {
                                cacheCount++;
                            }
                        }
                        cursor.continue();
                    } else {
                        Module.populateString(stringPtr, JSON.stringify(purgedRecords));
                        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "purgeAndGetOldCachedAssets: fetched record", purgedRecords);
                    }
                } catch(e) {
                    ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "purgeAndGetOldCachedAssets: failed with exception in cursor", e);
                    txnData.txn.abort();
                }
            }
            
            searchIndexCursor.onerror = function (event) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "purgeAndGetOldCachedAssets Failed to open cursor with error: ", event);
            }
        }

        IndexedDBHandler.excecuteOperations([idbConfig.AssetsTblInfo.name, idbConfig.ActiveAssetsTblInfo.name],
                                            IDBTransactionMode.READ_WRITE, operationsFn, "purgeAndGetOldCachedAssets", asyncInfoAddr);
    }

    return {
        open,
        close,
        createOrReplaceActiveAssetEntry,
        removeActiveAssetEntry,
        clearActiveAssets,
        getActiveAsset,
        getAllActiveAssets,
        getActiveAssetsByAssetID,
        getActiveAssetsBySessionID,
        createAssetEntry,
        removeAssetEntry,
        clearAssets,
        updateLocalFileStateInfo,
        updateRemoteFileStateInfo,
        updateLocalFileTimeStamp,
        updateLocalFileTimeStampIfNotChanged,
        updateLocalFileTimeStampWithLastSyncTimeStampIfNotChanged,
        updateRemoteFileTimeStamp,
        updateAssetLastSyncTimeStamp,
        updateAssetLastHeartbeatTimeStamp,
        setAssetConflictInfo,
        clearAssetConflictInfo,
        getAssetsByAssetID,
        getAssetsByUserID,
        getAsset,
        getLastHeartbeatTimeStamp,
        createOrUpdateAssetEntry,
        purgeAndGetOldCachedAssets
    }
})()
