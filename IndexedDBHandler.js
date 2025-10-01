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

"use strict";

// This file should only have generic IndexedDB operations. All the business logic should be kept in IndexedDBDataAccess.js file.

const IDBTransactionMode =  {
    READ_ONLY : "readonly",
    READ_WRITE : "readwrite",
};

const IndexedDBHandler = (function () {
    const COMP_NAME = "IndexedDBHandler";

    // IndexedDB database handle
    let idb = null;

    // the following utility functions, call into the wasm engine
    // asyncInfoAddr, a 32-bit integer, is the memory address of an
    // async function status info block maintained by the wasm engine.
    // The async function in question is the one calling the util function
    // When we call C++, this integer gets converted into a pointer which gets
    // dereferenced ... and then the status gets updated

    const ACPLNotifyAsyncFuncFailed = Module.cwrap('ACPLNotifyAsyncFuncFailed', null, ['number'])
    const ACPLNotifyAsyncFuncCompletedWithRetVal = Module.cwrap('ACPLNotifyAsyncFuncCompletedWithRetVal', null, ['number', 'number'])
    const ACPLNotifyAsyncFuncCompleted = Module.cwrap('ACPLNotifyAsyncFuncCompleted', null, ['number'])
    const ACPLNotifyAsyncFuncFailedWithRetVal = Module.cwrap('ACPLNotifyAsyncFuncFailedWithRetVal', null, ['number', 'number'])

    function DOMExceptionToIdbJSErrorCode(e) {
        switch (e.name) {
            case "IndexSizeError" : return Module.IdbJSErrorCode.IndexSizeError.value;
            case "HierarchyRequestError" : return Module.IdbJSErrorCode.HierarchyRequestError.value;
            case "WrongDocumentError" : return Module.IdbJSErrorCode.WrongDocumentError.value;
            case "InvalidCharacterError" : return Module.IdbJSErrorCode.InvalidCharacterError.value;
            case "NoModificationAllowedError" : return Module.IdbJSErrorCode.NoModificationAllowedError.value;
            case "NotFoundError" : return Module.IdbJSErrorCode.NotFoundError.value;
            case "NotSupportedError" : return Module.IdbJSErrorCode.NotSupportedError.value;
            case "InvalidStateError" : return Module.IdbJSErrorCode.InvalidStateError.value;
            case "InUseAttributeError" : return Module.IdbJSErrorCode.InUseAttributeError.value;
            case "SyntaxError" : return Module.IdbJSErrorCode.SyntaxError.value;
            case "InvalidModificationError" : return Module.IdbJSErrorCode.InvalidModificationError.value;
            case "NamespaceError" : return Module.IdbJSErrorCode.NamespaceError.value;
            case "InvalidAccessError" : return Module.IdbJSErrorCode.InvalidAccessError.value;
            case "SecurityError" : return Module.IdbJSErrorCode.SecurityError.value;
            case "TimeoutError" : return Module.IdbJSErrorCode.TimeoutError.value;
            case "NotAllowedError" : return Module.IdbJSErrorCode.NotAllowedError.value;
            case "AbortError" : return Module.IdbJSErrorCode.AbortError.value;
            case "DataCloneError" : return Module.IdbJSErrorCode.DataCloneError.value;
            case "EncodingError" : return Module.IdbJSErrorCode.EncodingError.value;
            case "NotReadableError" : return Module.IdbJSErrorCode.NotReadableError.value;
            case "ConstraintError" : return Module.IdbJSErrorCode.ConstraintError.value;
            case "DataError" : return Module.IdbJSErrorCode.DataError.value;
            case "TransactionInactiveError" : return Module.IdbJSErrorCode.TransactionInactiveError.value;
            case "ReadOnlyError" : return Module.IdbJSErrorCode.ReadOnlyError.value;
            case "VersionError" : return Module.IdbJSErrorCode.VersionError.value;
            default:
                return Module.IdbJSErrorCode.Unknown.value;
        }
    }
    
    /**
     * @brief Opens the IndexedDB database
     * @param databaseInfo - Database information object containing name & version.
     * @param successCb - Success callback.
     * @param upgradeCb - Upgrade callback.
     * @param versionChangeCB - Version change callback.
     * @param errorCb - Error callback.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
     */
    function open(databaseInfo, successCb, upgradeCb, versionChangeCB, errorCb, asyncInfoAddr) {
        if (!databaseInfo) {
            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "open: Database info is invalid");
            ACPLNotifyAsyncFuncFailedWithRetVal(asyncInfoAddr, Module.IdbJSErrorCode.DatabaseNotOpened.value);
            return;
        }

        if (idb) {
            ACPLJSLogger.log(LogLevels.WAR, COMP_NAME, "open: Database is already opened");
            ACPLNotifyAsyncFuncCompleted(asyncInfoAddr);
            return;
        }

        try {
            let openRequest = indexedDB.open(databaseInfo.databaseName, databaseInfo.databaseVersion);

            openRequest.onsuccess = function(event) {
                ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "open: openRequest.onsuccess start");
                if (!idb) {
                    // Get a reference to the IDBDatabase object for this request
                    // @type IDBDatabase
                    idb = event.target.result;
                }
                successCb(event);

                // Version change handling for open connection
                idb.onversionchange = function(event) {
                    ACPLJSLogger.log(LogLevels.WAR, COMP_NAME, "open: Version change event received ", event);
                    idb.close();
                    idb = null;
                    versionChangeCB(event);
                };

                // To handle unexpected close scenario. The close event is fired on IDBDatabase
                // when the database connection is unexpectedly closed. This could happen, for example,
                // if the underlying storage is removed or if the user clears the database in the browser's history preferences.
                //!#TODO need callback to notify?
                idb.onclose = function(event) {
                    ACPLJSLogger.log(LogLevels.WAR, COMP_NAME, "open: Database connection closed ", event);
                };

                ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "open: openRequest.onsuccess end");
                ACPLNotifyAsyncFuncCompleted(asyncInfoAddr);
            };

            // create/upgrade the database with version checks
            openRequest.onupgradeneeded = function(event) {
                ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "open: Version upgrade event received ", event);
                // Get a reference to the IDBDatabase object for this request
                // @type IDBDatabase
                idb = event.target.result;
                upgradeCb(event);
            };
            
            openRequest.onerror = function(event) {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "open: error event received ", event);
                errorCb(event);
                ACPLNotifyAsyncFuncFailedWithRetVal(asyncInfoAddr, DOMExceptionToIdbJSErrorCode(event.target.error));
            };

            openRequest.onblocked = function(event) {
                // this event shouldn't trigger if we handle onversionchange correctly

                // it means that there's another open connection to the same database
                // and it wasn't closed after idb.onversionchange triggered for it
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "open: blocked event received ", event.target.result);
                ACPLNotifyAsyncFuncFailedWithRetVal(asyncInfoAddr, Module.IdbJSErrorCode.OpenDatabaseBlocked.value);
            };
        } catch (e) {
            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "open: open failed with exception ", e);
            ACPLNotifyAsyncFuncFailed(asyncInfoAddr);
        }
    }

    /**
     * @brief Closes the IndexedDB database
     */
    function close() {
        if (!idb) {
            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "close: Database idb is null");
            return;
        }
        ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "close: closing database");
        idb.close();
    }

    /**
     * @brief Insert/Update a record in object store.
     * @param tableName - Object store name.
     * @param record - Record to be inserted.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
     */
    function insertRecord(tableName, record, isUpdate, asyncInfoAddr) {
        function operationsFn(txnData) {
            let objectStore = txnData.txn.objectStore(tableName);
            const putOrAddRequest = isUpdate? objectStore.put(record): objectStore.add(record);
            
            putOrAddRequest.onsuccess = (event) => {
                ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "insertRecord: Added entry in ", tableName, record);
            };

            putOrAddRequest.onerror = (event) => {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "insertRecord: putOrAddRequest.onerror ", event.target.error);
            };
        }

        excecuteOperations(tableName, IDBTransactionMode.READ_WRITE, operationsFn, "insertRecord", asyncInfoAddr);
    }

    /**
     * @brief Remove a record from object store.
     * @param tableName - Object store name.
     * @param key - Key of the record to be removed.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
     */
    function removeRecord(tableName, key, asyncInfoAddr) {
        function operationsFn(txnData) {
            let objectStore = txnData.txn.objectStore(tableName);
            const removeRequest = objectStore.delete(key);

            removeRequest.onsuccess = (event) => {
                ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "removeRecord: Removed entry from ", tableName);
            };

            removeRequest.onerror = (event) => {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "removeRecord: removeRequest.onerror ", event.target.error);
            };
        }

        excecuteOperations(tableName, IDBTransactionMode.READ_WRITE, operationsFn, "removeRecord", asyncInfoAddr);
    }

    /**
     * @brief Get a record from object store.
     * @param tableName - Object store name.
     * @param key - Key of the record to be retrieved.
     * @param callback - Callback to process the record.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
     */
    function getRecord(tableName, key, callback, asyncInfoAddr) {
        function operationsFn(txnData) {
            let objectStore = txnData.txn.objectStore(tableName);
            const getRequest = objectStore.get(key);
            
            getRequest.onsuccess = (event) => {
                if (!event.target.result) {
                    ACPLJSLogger.log(LogLevels.WAR, COMP_NAME, "getRecord: Aborting the transaction as record not found in ", tableName);
                    txnData.abortErrorCode = Module.IdbJSErrorCode.NotFoundError.value;
                    txnData.txn.abort();
                } else {
                    ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getRecord: The record found in ", tableName, event.target.result);
                    if (!callback(event.target.result)) {
                        ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "getRecord: Aborting the transaction as callback failed");
                        txnData.txn.abort();
                    }
                }
            };

            getRequest.onerror = (event) => {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "getRecord: getRequest.onerror ", event.target.error);
            };
        }

        excecuteOperations(tableName, IDBTransactionMode.READ_ONLY, operationsFn, "getRecord", asyncInfoAddr);
    }

    /**
     * @brief Get all records from object store.
     * @param tableName - Object store name.
     * @param callback - Callback to process the records.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
     */
    function getAllRecords(tableName, callback, asyncInfoAddr) {
        function operationsFn(txnData) {
            let objectStore = txnData.txn.objectStore(tableName);
            const getRequest = objectStore.getAll();
            
            getRequest.onsuccess = (event) => {
                if (!event.target.result) {
                    ACPLJSLogger.log(LogLevels.WAR, COMP_NAME, "getAllRecords: No record found in ", tableName);
                } else {
                    ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getAllRecords: Number of record found ", event.target.result.length);
                    if (!callback(event.target.result)) {
                        ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "getAllRecords: Aborting the transaction as callback failed");
                        txnData.txn.abort();
                    }
                }
            };

            getRequest.onerror = (event) => {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "getAllRecords: getRequest.onerror ", event.target.error);
            };
        }

        excecuteOperations(tableName, IDBTransactionMode.READ_ONLY, operationsFn, "getAllRecords", asyncInfoAddr);
    }

    /**
     * @brief Get all records for an index value from object store.
     * @param tableName - Object store name.
     * @param indexInfo - The index along with it's value.
     * @param callback - Callback to process the records.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
     */
    function getRecordsByIndex(tableName, indexInfo, callback, asyncInfoAddr) {
        function operationsFn(txnData) {
            let objectStore = txnData.txn.objectStore(tableName);
            let records = [];
            const searchIndex = objectStore.index(indexInfo.name);
            searchIndex.openCursor(indexInfo.range, indexInfo.direction).onsuccess = function (event) {
                try {
                    const cursor = event.target.result;
                    if (cursor) {
                        records.push(cursor.value);
                        cursor.continue();
                    } else {
                        ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "getRecordsByIndex: Number of record found ", records.length);
                        if (!callback(records)) {
                            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "getRecordsByIndex: Aborting the transaction as callback failed");
                            txnData.txn.abort();
                        }
                    }
                } catch (e) {
                    ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "getRecordsByIndex: Aborting the transaction as due to exception", e);
                    txnData.txn.abort();
                }
            };
        }

        excecuteOperations(tableName, IDBTransactionMode.READ_ONLY, operationsFn, "getRecordsByIndex", asyncInfoAddr);
    }

    /**
     * @brief Update a record in object store. If the record does not exist, the API will not fail and do nothing.
     * @param tableName - Object store name.
     * @param key - Key of the record to be updated.
     * @param callback - Callback to process the records.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
     */
    function updateRecord(tableName, key, callback, asyncInfoAddr) {
        function operationsFn(txnData) {
            let objectStore = txnData.txn.objectStore(tableName);
            const getRequest = objectStore.get(key);
            
            getRequest.onsuccess = (getRequestEvent) => {
                if (!getRequestEvent.target.result) {
                    ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "updateRecord: Aborting the transaction as the record not found in", tableName);
                    txnData.abortErrorCode = Module.IdbJSErrorCode.NotFoundError.value;
                    txnData.needSuppressAbortError = true;
                    txnData.txn.abort();
                } else {
                    ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, "updateRecord: The record found in ", tableName);
                    const data = callback(getRequestEvent.target.result);
                    if (data) {
                        const putRequest = objectStore.put(data);

                        putRequest.onsuccess = (putRequestEvent) => {
                            if (!putRequestEvent.target.result) {
                                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "updateRecord: Aborting the transaction as the record not found in putRequest in", tableName);
                                txnData.abortErrorCode = Module.IdbJSErrorCode.NotFoundError.value
                                txnData.txn.abort();
                            } else {
                                ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "updateRecord: The record updated in ", tableName);
                            }
                        };

                        putRequest.onerror = (putRequestEvent) => {
                            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "updateRecord: putRequest.onerror ", putRequestEvent.target.error);
                        };
                    } else {
                        ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "updateRecord: Aborting the transaction as callback failed");
                        txnData.abortErrorCode = Module.IdbJSErrorCode.Unknown.value
                        txnData.txn.abort();
                    }
                }
            };

            getRequest.onerror = (getRequestEvent) => {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "updateRecord: getRequest.onerror ", getRequestEvent.target.error);
            };
        }

        excecuteOperations(tableName, IDBTransactionMode.READ_WRITE, operationsFn, "updateRecord", asyncInfoAddr);
    }

    /**
     * @brief Create/Update a record in object store.
     * @param tableName - Object store name.
     * @param key - Key of the record to be updated.
     * @param foundCB - Callback to process the record if the record exists.
     * @param notFoundCB - Callback to process the record if the record does not exist.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
     */
    function createOrUpdateRecord(tableName, key, foundCB, notFoundCB, asyncInfoAddr) {
        function operationsFn(txnData) {
            let objectStore = txnData.txn.objectStore(tableName);
            const getRequest = objectStore.get(key);
            
            getRequest.onsuccess = (getRequestEvent) => {
                let data;
                if (!getRequestEvent.target.result) {
                    ACPLJSLogger.log(LogLevels.WAR, COMP_NAME, "createOrUpdateRecord: The record not found in ", tableName);
                    data = notFoundCB();
                } else {
                    ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "createOrUpdateRecord: The record found in ", tableName);
                    data = foundCB(getRequestEvent.target.result);
                }

                if (data) {
                    const putRequest = objectStore.put(data);

                    putRequest.onsuccess = (putRequestEvent) => {
                        if (!putRequestEvent.target.result) {
                            ACPLJSLogger.log(LogLevels.WAR, COMP_NAME, "createOrUpdateRecord: Aborting the transaction as the record not created/updated in", tableName);
                            txnData.abortErrorCode = Module.IdbJSErrorCode.NotFoundError.value
                            txnData.txn.abort();
                        } else {
                            ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "createOrUpdateRecord: The record updated in ", tableName);
                        }
                    };

                    putRequest.onerror = (putRequestEvent) => {
                        ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "createOrUpdateRecord: putRequest.onerror ", putRequestEvent.target.error);
                    };
                } else {
                    ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "createOrUpdateRecord: Aborting the transaction as callback failed");
                    txnData.txn.abort();
                }
            };

            getRequest.onerror = (getRequestEvent) => {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "updateRecord: getRequest.onerror ", getRequestEvent.target.error);
            };
        }

        excecuteOperations(tableName, IDBTransactionMode.READ_WRITE, operationsFn, "createOrUpdateRecord", asyncInfoAddr);
    }

    /**
     * @brief Remove all record from object store.
     * @param tableName - Object store name.
     * @param asyncInfoAddr - A parameter passed from WASM code for tracking completion of the call.
     */
    function clearRecords(tableName, asyncInfoAddr) {
        function operationsFn(txnData) {
            let objectStore = txnData.txn.objectStore(tableName);
            const clearRequest = objectStore.clear();
            
            clearRequest.onsuccess = (event) => {
                ACPLJSLogger.log(LogLevels.INF, COMP_NAME, "clearRecords: Clear all entries from ", tableName);
            };

            clearRequest.onerror = (event) => {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, "clearRecords: clearRequest failed", event.target.error);
            };
        }

        excecuteOperations(tableName, IDBTransactionMode.READ_WRITE, operationsFn, "clearRecords", asyncInfoAddr);
    }

    /**
     * Updates or removes records in the specified table of the IndexedDB database. This function can only be called during database migration only.
     * 
     * @param {IDBTransaction} txn - The transaction object for the IndexedDB database.
     * @param {Array<Function>} upgradeFns - An array of upgrade functions to be executed after updating the records.
     * @param {string} tableName - The name of the table in which the records should be updated.
     * @param {string} funcName - The name of the calling function.
     * @param {Function} updateOrRemoveFn - Callback function to update or remove the records. The function should return the updated records or keys of the records to be removed.
     * @param {boolean} isUpdate - A flag indicating whether the operation is an update or removal.
     */
    function updateOrRemoveRecords(txn, upgradeFns, tableName, funcName, updateOrRemoveFn, isUpdate) {
        if (!txn) {
            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, funcName, ": transaction is null");
            return;
        }

        try {
            const objectStore = txn.objectStore(tableName);
            const getRequest = objectStore.getAll();

            getRequest.onsuccess = (event) => {
                try {
                    let records;
                    if (!event.target.result) {
                        ACPLJSLogger.log(LogLevels.WAR, COMP_NAME, funcName, ": No record to update");
                    } else {
                        ACPLJSLogger.log(LogLevels.INF, COMP_NAME, funcName, ": updating records", tableName);
                        records = updateOrRemoveFn(event.target.result);
                    }

                    // As we do not have batch update option, we need to update records one by one.
                    // This function will update all the records and then executes next migration if
                    // exists.
                    function updateDataFn(recordLs, txn, upgradeFnsParam) {
                        try {
                            if (0 == recordLs.length) {
                                // All the records are updated, checking for next migration, if exists
                                // execute that.
                                if (upgradeFnsParam.length != 0) {
                                    fn = upgradeFnsParam.pop();
                                    fn(txn, upgradeFnsParam);
                                }
                                return;
                            }

                            // Get the next record(and remove from the list) and update it.
                            let rec = recordLs.pop();
                            const putOrDeleteRequest = isUpdate? objectStore.put(rec): objectStore.delete(rec);

                            putOrDeleteRequest.onsuccess = (event) => {
                                const operation = isUpdate ? "updated" : "deleted";
                                ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, funcName, ": The record", operation, "in ", tableName);
                                // Recursively call itself to update the next record or execute the next migration.
                                updateDataFn(recordLs, txn, upgradeFns);
                            };

                            putOrDeleteRequest.onerror = (event) => {
                                if (isUpdate) {
                                    ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, funcName, ": putRequest.onerror ", event.target.error);
                                } else {
                                    ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, funcName, ": deleteRequest.onerror ", event.target.error);
                                }
                            };
                        } catch (e) {
                            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, funcName, ": Aborting transaction due to exception updateDataFn", e);
                            txn.abort();
                        }
                    }

                    // Do nothing if no record found.
                    if (undefined == records) {
                        if (0 == upgradeFns.length) {
                            return
                        }
                        let fn = upgradeFns.pop();
                        fn(txn, upgradeFns);
                    } else {
                        updateDataFn(records, txn, upgradeFns);
                    }
                } catch (e) {
                    ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, funcName, ": Aborting transaction due to exception on success", e);
                    txn.abort();
                }
            };

            getRequest.onerror = (event) => {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, funcName, ": getRequest.onerror ", event.target.error);
            };
        }
        catch (e) {
            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, funcName, ": Aborting transaction due to exception", e);
            txn.abort();
        }
    }

    /**
     * @brief Add or remove properties from all records. This function can only be called during database migration only.
     * @param txn - The database upgrade transaction. Do not pass other transaction.
     * @param upgradeFns - The list of upgrade functions those need to executed sequentially in order.
     * @param tableName - Object store name.
     * @param updateRecordsFn - Callback function to update records. The function should return the updated records.
     */
    function updatePropertiesInAllRecords(txn, upgradeFns, tableName, updateRecordsFn) {
        updateOrRemoveRecords(txn, upgradeFns, tableName, "updatePropertiesInAllRecords", updateRecordsFn, true);
    }

    /**
     * @brief Remove records from specified table/objectstore. This function can only be called during database migration only.
     * @param txn - The database upgrade transaction. Do not pass other transaction.
     * @param upgradeFns - The list of upgrade functions those need to executed sequentially in order.
     * @param tableName - Object store name.
     * @param removeRecordsFn - Callback function toremove records. The function should return keys of the records to be removed.
     */
    function removeRecords(txn, upgradeFns, tableName, removeRecordsFn) {
        updateOrRemoveRecords(txn, upgradeFns, tableName, "removeRecords", removeRecordsFn, false);
    }

    /**
     * Returns an object containing transaction data.
     *
     * @param {Transaction} transaction - The transaction object.
     * @returns {Object} An object containing the transaction and abort error code.
     */
    function getTxnData(transaction) {
        return {
            txn: transaction,
            abortErrorCode: Module.IdbJSErrorCode.Unknown.value,
            needSuppressAbortError: false
        };
    }

    /**
     * Executes a series of operations on an IndexedDB transaction.
     *
     * @param {Array<string>} storeNames - The names of the object stores to include in the transaction.
     * @param {string} txnMode - The transaction mode.
     * @param {Function} operationsFn - The function that contains the user-provided operations to be executed on the transaction.
     * @param {string} funcName - The name of the function.
     * @param {number} asyncInfoAddr - The address of the asynchronous operation info.
     */
    function excecuteOperations(storeNames, txnMode, operationsFn, funcName, asyncInfoAddr) {
        if (!idb) {
            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, funcName, ": Database idb is null");
            ACPLNotifyAsyncFuncFailedWithRetVal(asyncInfoAddr, Module.IdbJSErrorCode.DatabaseNotOpened.value);
            return;
        }

        try {
            let txnData = getTxnData(idb.transaction(storeNames, txnMode));
            // report on the success of the transaction completing, when everything is done
            txnData.txn.oncomplete = (event) => {
                ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, funcName, ": transaction completed", event);
                ACPLNotifyAsyncFuncCompleted(asyncInfoAddr);
            };

            txnData.txn.onerror = (event) => {
                ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, funcName, ": transaction.onerror ", event.target.error);
                ACPLNotifyAsyncFuncFailedWithRetVal(asyncInfoAddr, DOMExceptionToIdbJSErrorCode(event.target.error));
            };

            txnData.txn.onabort = (event) => {
                if (false == txnData.needSuppressAbortError) {
                    ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, funcName, ": transaction aborted", event);
                    ACPLNotifyAsyncFuncFailedWithRetVal(asyncInfoAddr, txnData.abortErrorCode);
                } else {
                    ACPLJSLogger.log(LogLevels.DBG, COMP_NAME, funcName, ": transaction aborted, but suppress the error", event);
                    ACPLNotifyAsyncFuncCompleted(asyncInfoAddr);
                }
            };

            // execute the user provided operations
            operationsFn(txnData);

        } catch (e) {
            ACPLJSLogger.log(LogLevels.ERR, COMP_NAME, funcName, ": failed with exception", e);
            ACPLNotifyAsyncFuncFailed(asyncInfoAddr);
        }
    }

    return {
        open,
        close,
        insertRecord,
        removeRecord,
        getRecord,
        getAllRecords,
        getRecordsByIndex,
        clearRecords,
        updateRecord,
        createOrUpdateRecord,
        updatePropertiesInAllRecords,
        removeRecords,
        excecuteOperations
    }
})()
