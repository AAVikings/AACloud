﻿exports.newMultiPeriodDaily = function newMultiPeriodDaily(bot, logger, COMMONS, UTILITIES, USER_BOT_MODULE, COMMONS_MODULE) {

    const FULL_LOG = true;
    const LOG_FILE_CONTENT = false;
    const MODULE_NAME = "Multi Period Daily";
    const GMT_SECONDS = ':00.000 GMT+0000';
    const ONE_DAY_IN_MILISECONDS = 24 * 60 * 60 * 1000;

    thisObject = {
        initialize: initialize,
        start: start
    };

    let utilities = UTILITIES.newCloudUtilities(logger);

    let statusDependencies;
    let dataDependencies;
    let storages = [];
    let dataFiles = [];

    let usertBot;

    const FILE_STORAGE = require('./Integrations/FileStorage.js');
    let fileStorage = FILE_STORAGE.newFileStorage(logger);

    let processConfig;

    return thisObject;

    function initialize(pProcessConfig, pStatusDependencies, pDataDependencies, pAssistant, callBackFunction) {

        try {

            logger.fileName = MODULE_NAME;
            logger.initialize();

            if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] initialize -> Entering function."); }

            statusDependencies = pStatusDependencies;
            dataDependencies = pDataDependencies;
            processConfig = pProcessConfig;

            for (let i = 0; i < dataDependencies.config.length; i++) {

                let key;
                let storage;
                let dependency = dataDependencies.config[i];

                key = dependency.devTeam + "-" +
                    dependency.bot + "-" +
                    dependency.product + "-" +
                    dependency.dataSet + "-" +
                    dependency.dataSetVersion

                storage = dataDependencies.dataSets.get(key);

                storages.push(storage);

            }

            usertBot = USER_BOT_MODULE.newUserBot(bot, logger, COMMONS_MODULE, UTILITIES, fileStorage);
            usertBot.initialize(dataDependencies, callBackFunction, pAssistant);

        } catch (err) {
            logger.write(MODULE_NAME, "[ERROR] initialize -> err = "+ err.stack);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function start(callBackFunction) {

        try {

            if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> Entering function."); }

            let market = global.MARKET;

            /* Context Variables */

            let contextVariables = {
                lastFile: undefined,                // Datetime of the last file files sucessfully produced by this process.
                dateBeginOfMarket: undefined,       // Datetime of the first trade file in the whole market history.
                dateEndOfMarket: undefined          // Datetime of the last file available to be used as an input of this process.
            };

            let previousDay;                        // Holds the date of the previous day relative to the processing date.

            let interExecutionMemoryArray;

            getContextVariables();

            function getContextVariables() {

                try {

                    if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> getContextVariables -> Entering function."); }

                    let thisReport;
                    let reportKey;
                    let statusReport;

                    if (processConfig.framework.startDate.fixedDate !== undefined) {

                        /* The starting date is fixed, we will start from there. */

                        if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> getContextVariables -> We have got a user defined startDate. -> startDate = " + processConfig.framework.startDate.fixedDate); }
                        contextVariables.dateBeginOfMarket = new Date(processConfig.framework.startDate.fixedDate);

                    } else {

                        /*
                            We look first for the bot who knows the begining of the marke in order to get when the market starts.
                        */

                        let botWhoKnowsTheBeginingOfTheMarket = statusDependencies.config[processConfig.framework.startDate.takeItFromStatusDependency];

                        reportKey = botWhoKnowsTheBeginingOfTheMarket.devTeam + "-" + botWhoKnowsTheBeginingOfTheMarket.bot + "-" + botWhoKnowsTheBeginingOfTheMarket.process + "-" + "dataSet.V1";
                        if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> getContextVariables -> reportKey = " + reportKey); }

                        statusReport = statusDependencies.statusReports.get(reportKey);

                        if (statusReport === undefined) { // This means the status report does not exist, that could happen for instance at the begining of a month.
                            logger.write(MODULE_NAME, "[WARN] start -> getContextVariables -> Status Report does not exist. Retrying Later. ");
                            callBackFunction(global.DEFAULT_RETRY_RESPONSE);
                            return;
                        }

                        if (statusReport.status === "Status Report is corrupt.") {
                            logger.write(MODULE_NAME, "[ERROR] start -> getContextVariables -> Can not continue because dependecy Status Report is corrupt. ");
                            callBackFunction(global.DEFAULT_RETRY_RESPONSE);
                            return;
                        }

                        thisReport = statusDependencies.statusReports.get(reportKey).file;

                        if (thisReport.lastFile === undefined) {
                            logger.write(MODULE_NAME, "[WARN] start -> getContextVariables -> Undefined Last File. -> reportKey = " + reportKey);
                            logger.write(MODULE_NAME, "[HINT] start -> getContextVariables -> It is too early too run this process since the trade history of the market is not there yet.");

                            let customOK = {
                                result: global.CUSTOM_OK_RESPONSE.result,
                                message: "Dependency does not exist."
                            }
                            logger.write(MODULE_NAME, "[WARN] start -> getContextVariables -> customOK = " + customOK.message);
                            callBackFunction(customOK);
                            return;
                        }

                        contextVariables.dateBeginOfMarket = new Date(thisReport.lastFile.year + "-" + thisReport.lastFile.month + "-" + thisReport.lastFile.days + " " + thisReport.lastFile.hours + ":" + thisReport.lastFile.minutes + GMT_SECONDS);

                    }

                    if (processConfig.framework.endDate.fixedDate !== undefined) {

                        /* The ending date is fixed, we will end there. */
                        if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> getContextVariables -> We have got a user defined endDate. -> endDate = " + processConfig.framework.endDate.fixedDate); }
                        contextVariables.dateEndOfMarket = new Date(processConfig.framework.endDate.fixedDate);

                    } else {

                        /*
                          Here we get the status report from the bot who knows which is the end of the market.
                        */

                        let botWhoKnowsTheEndOfTheMarket = statusDependencies.config[processConfig.framework.endDate.takeItFromStatusDependency];

                        reportKey = botWhoKnowsTheEndOfTheMarket.devTeam + "-" + botWhoKnowsTheEndOfTheMarket.bot + "-" + botWhoKnowsTheEndOfTheMarket.process + "-" + "dataSet.V1";
                        if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> getContextVariables -> reportKey = " + reportKey); }

                        statusReport = statusDependencies.statusReports.get(reportKey);

                        if (statusReport === undefined) { // This means the status report does not exist, that could happen for instance at the begining of a month.
                            logger.write(MODULE_NAME, "[WARN] start -> getContextVariables -> Status Report does not exist. Retrying Later. ");
                            callBackFunction(global.DEFAULT_RETRY_RESPONSE);
                            return;
                        }

                        if (statusReport.status === "Status Report is corrupt.") {
                            logger.write(MODULE_NAME, "[ERROR] start -> getContextVariables -> Can not continue because dependecy Status Report is corrupt. ");
                            callBackFunction(global.DEFAULT_RETRY_RESPONSE);
                            return;
                        }

                        thisReport = statusDependencies.statusReports.get(reportKey).file;

                        if (thisReport.lastFile === undefined) {
                            logger.write(MODULE_NAME, "[WARN] start -> getContextVariables -> Undefined Last File. -> reportKey = " + reportKey);

                            let customOK = {
                                result: global.CUSTOM_OK_RESPONSE.result,
                                message: "Dependency not ready."
                            }
                            logger.write(MODULE_NAME, "[WARN] start -> getContextVariables -> customOK = " + customOK.message);
                            callBackFunction(customOK);
                            return;
                        }

                        contextVariables.dateEndOfMarket = new Date(thisReport.lastFile.valueOf());
                    }

                    /* Finally we get our own Status Report. */

                    reportKey = bot.devTeam + "-" + bot.codeName + "-" + "Multi-Period-Daily" + "-" + "dataSet.V1";
                    if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> getContextVariables -> reportKey = " + reportKey); }

                    statusReport = statusDependencies.statusReports.get(reportKey);

                    if (statusReport === undefined) { // This means the status report does not exist, that could happen for instance at the begining of a month.
                        logger.write(MODULE_NAME, "[WARN] start -> getContextVariables -> Status Report does not exist. Retrying Later. ");
                        callBackFunction(global.DEFAULT_RETRY_RESPONSE);
                        return;
                    }

                    if (statusReport.status === "Status Report is corrupt.") {
                        logger.write(MODULE_NAME, "[ERROR] start -> getContextVariables -> Can not continue because self dependecy Status Report is corrupt. Aborting Process.");
                        callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                        return;
                    }

                    thisReport = statusDependencies.statusReports.get(reportKey).file;

                    if (thisReport.lastFile !== undefined) {

                        if (bot.hasTheBotJustStarted === true && processConfig.framework.startDate.resumeExecution === false) {

                            if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> getContextVariables -> Starting from the begining because bot has just started and resume execution was true."); }
                            startFromBegining();
                            return;
                        }

                        contextVariables.lastFile = new Date(thisReport.lastFile);
                        interExecutionMemoryArray = thisReport.interExecutionMemoryArray;

                        processTimePeriods();
                        return;

                    } else {

                        /*
                        In the case when there is no status report, we assume like the last processed file is the one on the date of Begining of Market.
                        */
                        if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> getContextVariables -> Starting from the begining of the market because own status report not found or lastFile was undefined."); }
                        startFromBegining();
                        return;
                    }

                    function startFromBegining() {

                        contextVariables.lastFile = new Date(contextVariables.dateBeginOfMarket.getUTCFullYear() + "-" + (contextVariables.dateBeginOfMarket.getUTCMonth() + 1) + "-" + contextVariables.dateBeginOfMarket.getUTCDate() + " " + "00:00" + GMT_SECONDS);

                        if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> getContextVariables -> startFromBegining -> contextVariables.lastFile = " + contextVariables.lastFile); }

                        /*
                        The first time the process is running is the right time to create the data structure that is going to be shared across different executions.
                        This data structure has one object per each timePeriod.
                        */

                        interExecutionMemoryArray = [];

                        for (let i = 0; i < global.dailyFilePeriods.length; i++) {
                            let emptyObject = {};
                            interExecutionMemoryArray.push(emptyObject);
                        }

                        processTimePeriods();

                    }

                } catch (err) {
                    logger.write(MODULE_NAME, "[ERROR] start -> getContextVariables -> err = "+ err.stack);
                    if (err.message === "Cannot read property 'file' of undefined") {
                        logger.write(MODULE_NAME, "[HINT] start -> getContextVariables -> Check the bot configuration to see if all of its statusDependencies declarations are correct. ");
                        logger.write(MODULE_NAME, "[HINT] start -> getContextVariables -> Dependencies loaded -> keys = " + JSON.stringify(statusDependencies.keys));
                    }
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function processTimePeriods() {

                if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> Entering function."); }

                try {

                    let n;
                    let botNeverRan = true;

                    bot.multiPeriodDailyProcessDatetime = new Date(contextVariables.lastFile.valueOf() - ONE_DAY_IN_MILISECONDS); // Go back one day to start well when we advance time at the begining of the loop.

                    advanceTime();

                    function advanceTime() {

                        try {

                            if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> advanceTime -> Entering function."); }

                            bot.multiPeriodDailyProcessDatetime = new Date(bot.multiPeriodDailyProcessDatetime.valueOf() + ONE_DAY_IN_MILISECONDS);
                            previousDay = new Date(bot.multiPeriodDailyProcessDatetime.valueOf() - ONE_DAY_IN_MILISECONDS);

                            console.log(new Date().toISOString() + " " + pad(bot.codeName, 20) + " " + pad(bot.process, 30) + " " + " bot.multiPeriodDailyProcessDatetime = " + bot.multiPeriodDailyProcessDatetime.toISOString());

                            if (global.FULL_LOG === 'true') {
                                logger.newInternalLoop(bot.codeName, bot.process);
                            }

                            if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> advanceTime -> bot.multiPeriodDailyProcessDatetime = " + bot.multiPeriodDailyProcessDatetime); }
                            if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> advanceTime -> previousDay = " + previousDay); }

                            /* Validation that we are not going past the head of the market. */

                            if (bot.multiPeriodDailyProcessDatetime.valueOf() > contextVariables.dateEndOfMarket.valueOf()) {

                                const logText = "Head of the market found @ " + previousDay.getUTCFullYear() + "/" + (previousDay.getUTCMonth() + 1) + "/" + previousDay.getUTCDate() + ".";
                                if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> advanceTime -> " + logText); }

                                callBackFunction(global.DEFAULT_OK_RESPONSE);
                                return;

                            }

                            periodsLoop();

                        } catch (err) {
                            logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> advanceTime -> err = "+ err.stack);
                            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                        }
                    }

                    function periodsLoop() {

                        try {

                            if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> periodsLoop -> Entering function."); }

                            /*

                            We will iterate through all posible periods.

                            */

                            n = 0   // loop Variable representing each possible period as defined at the periods array.

                            periodsLoopBody();

                        }
                        catch (err) {
                            logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsLoop -> err = "+ err.stack);
                            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                        }
                    }

                    function periodsLoopBody() {

                        try {

                            if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> periodsLoopBody -> Entering function."); }

                            const timePeriod = global.dailyFilePeriods[n][0];
                            const outputPeriodLabel = global.dailyFilePeriods[n][1];

                            if (processConfig.framework.validPeriods !== undefined) {
                                let validPeriod = false;
                                for (let i = 0; i < processConfig.framework.validPeriods.length; i++) {
                                    let period = processConfig.framework.validPeriods[i];
                                    if (period === outputPeriodLabel) { validPeriod = true }
                                }
                                if (validPeriod === false) {
                                    if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> periodsLoopBody -> Discarding period for not being listed as a valid period. -> outputPeriodLabel = " + outputPeriodLabel); }
                                    periodsControlLoop();
                                    return;
                                }
                            }

                            let timePeriodFilter = global.EXECUTION_CONFIG.timePeriodFilter
                            if (timePeriodFilter !== undefined) {
                                if (timePeriodFilter.indexOf(outputPeriodLabel) === -1) {
                                    if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> periodsLoopBody -> Discarding period for being filtered out. -> outputPeriodLabel = " + outputPeriodLabel); }
                                    if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> periodsLoopBody -> Discarding period for being filtered out. -> timePeriodFilter = " + timePeriodFilter); }
                                    periodsControlLoop();
                                    return;
                                }
                            }

                            let dependencyIndex = 0;
                            dataFiles = [];

                            dependencyLoopBody();

                            function dependencyLoopBody() {

                                try {

                                    if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> Entering function."); }

                                    let dependency = dataDependencies.config[dependencyIndex];
                                    let storage = storages[dependencyIndex];

                                    let previousFile;
                                    let currentFile;

                                    if (bot.multiPeriodDailyProcessDatetime.valueOf() > contextVariables.dateBeginOfMarket.valueOf()) {
                                        getPreviousFile();
                                    } else {
                                        previousFile = [];
                                        getCurrentFile()
                                    }

                                    function getPreviousFile() {

                                        try {

                                            if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getPreviousFile -> Entering function."); }

                                            let dateForPath = previousDay.getUTCFullYear() + '/' + utilities.pad(previousDay.getUTCMonth() + 1, 2) + '/' + utilities.pad(previousDay.getUTCDate(), 2);
                                            let filePath
                                            if (dependency.dataSet === "Multi-Period-Daily") {
                                                filePath = dependency.product + '/' + dependency.dataSet + "/" + outputPeriodLabel + "/" + dateForPath;
                                            } else {
                                                filePath = dependency.product + '/' + dependency.dataSet  + "/" + dateForPath;
                                            }
                                            let fileName = market.assetA + '_' + market.assetB + ".json";

                                            storage.getTextFile(filePath, fileName, onFileReceived);

                                            function onFileReceived(err, text) {

                                                try {

                                                    if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getPreviousFile -> onFileReceived -> Entering function."); }
                                                    if (LOG_FILE_CONTENT === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getPreviousFile -> onFileReceived -> text = " + text); }

                                                    if ((err.message === "File does not exist." && botNeverRan === true) || err.code === 'The specified key does not exist.') {

                                                        /*
                                                        Sometimes one of the dependencies of an indicator for some reasons are not calculated from the begining of the market.
                                                        When that happens we can not find those files. What we do in this situation is to move the time fordward until we can find
                                                        all the dependencies and the first run of the bot is successful.

                                                        After that, we will not accept more missing files on any of the dependencies, and if any is missing we will abort the processing.
                                                        */
                                                        logger.write(MODULE_NAME, "[WARN] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getPreviousFile -> onFileReceived -> Skipping day because file " + filePath + "/" + fileName + " was not found.");

                                                        advanceTime();
                                                        return;
                                                    }

                                                    if ((err.result === "Fail Because" && err.message === "File does not exist.") || err.code === 'The specified key does not exist.') {

                                                        logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getCurrentFile -> onFileReceived -> err = "+ err.stack);
                                                        callBackFunction(global.DEFAULT_RETRY_RESPONSE);
                                                        return;
                                                    }

                                                    if (err.result !== global.DEFAULT_OK_RESPONSE.result) {

                                                        logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getPreviousFile -> onFileReceived -> err = "+ err.stack);
                                                        callBackFunction(err);
                                                        return;
                                                    }

                                                    previousFile = JSON.parse(text);

                                                    getCurrentFile();

                                                }
                                                catch (err) {
                                                    logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getPreviousFile -> onFileReceived -> err = "+ err.stack);
                                                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                                }
                                            }
                                        }
                                        catch (err) {
                                            logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getPreviousFile -> err = "+ err.stack);
                                            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                        }
                                    }

                                    function getCurrentFile() {

                                        try {

                                            if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getCurrentFile -> Entering function."); }

                                            let dateForPath = bot.multiPeriodDailyProcessDatetime.getUTCFullYear() + '/' + utilities.pad(bot.multiPeriodDailyProcessDatetime.getUTCMonth() + 1, 2) + '/' + utilities.pad(bot.multiPeriodDailyProcessDatetime.getUTCDate(), 2);
                                            let filePath
                                            if (dependency.dataSet === "Multi-Period-Daily") {
                                                filePath = dependency.product + '/' + dependency.dataSet + "/" + outputPeriodLabel + "/" + dateForPath;
                                            } else {
                                                filePath = dependency.product + '/' + dependency.dataSet + "/" + dateForPath;
                                            }
                                            let fileName = market.assetA + '_' + market.assetB + ".json";

                                            storage.getTextFile(filePath, fileName, onFileReceived);

                                            function onFileReceived(err, text) {

                                                try {

                                                    if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getCurrentFile -> onFileReceived -> Entering function."); }
                                                    if (LOG_FILE_CONTENT === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getCurrentFile -> onFileReceived -> text = " + text); }

                                                    if ((err.result === "Fail Because" && err.message === "File does not exist.") || err.code === 'The specified key does not exist.') {

                                                        logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getCurrentFile -> onFileReceived -> err = " + err.code);
                                                        logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getCurrentFile -> onFileReceived -> filePath = " + filePath);
                                                        logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getCurrentFile -> onFileReceived -> fileName = " + fileName);
                                                        callBackFunction(global.DEFAULT_RETRY_RESPONSE);
                                                        return;
                                                    }

                                                    if (err.result !== global.DEFAULT_OK_RESPONSE.result) {

                                                        logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getCurrentFile -> onFileReceived -> err = " + err.code);
                                                        callBackFunction(err);
                                                        return;
                                                    }

                                                    currentFile = JSON.parse(text);

                                                    let dataFile = previousFile.concat(currentFile);

                                                    dataFiles.push(dataFile);
                                                    dependencyControlLoop();

                                                }
                                                catch (err) {
                                                    logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getCurrentFile -> onFileReceived -> err = "+ err.stack);
                                                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                                }
                                            }
                                        }
                                        catch (err) {
                                            logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsLoopBody -> dependencyLoopBody -> getCurrentFile -> err = "+ err.stack);
                                            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                        }
                                    }
                                }
                                catch (err) {
                                    logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsLoop -> dependencyLoopBody -> err = "+ err.stack);
                                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                }
                            }

                            function dependencyControlLoop() {

                                try {

                                    if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> dependencyControlLoop -> Entering function."); }

                                    dependencyIndex++;

                                    if (dependencyIndex < dataDependencies.config.length) {

                                        dependencyLoopBody();

                                    } else {

                                        callTheBot();

                                    }
                                }
                                catch (err) {
                                    logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> dependencyControlLoop -> err = "+ err.stack);
                                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                }
                            }

                            function callTheBot() {

                                try {

                                    if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> periodsLoopBody -> callTheBot -> Entering function."); }

                                    const timePeriod = global.dailyFilePeriods[n][0];
                                    const outputPeriodLabel = global.dailyFilePeriods[n][1];

                                    usertBot.start(
                                        dataFiles,
                                        timePeriod,
                                        outputPeriodLabel,
                                        bot.multiPeriodDailyProcessDatetime,
                                        contextVariables.dateBeginOfMarket,
                                        contextVariables.dateEndOfMarket,
                                        interExecutionMemoryArray[n],
                                        onBotFinished);

                                    function onBotFinished(err) {

                                        try {

                                            if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> periodsLoopBody -> callTheBot -> onBotFinished -> Entering function."); }

                                            if (err.result !== global.DEFAULT_OK_RESPONSE.result) {

                                                callBackFunction(err);
                                                return;
                                            }

                                            botNeverRan = false;
                                            periodsControlLoop();
                                        }
                                        catch (err) {
                                            logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsLoopBody -> callTheBot -> onBotFinished -> err = "+ err.stack);
                                            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                        }
                                    }
                                }
                                catch (err) {
                                    logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsLoopBody -> callTheBot -> err = "+ err.stack);
                                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                }
                            }
                        }
                        catch (err) {
                            logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsLoopBody -> err = "+ err.stack);
                            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                        }
                    }

                    function periodsControlLoop() {

                        try {

                            if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> periodsControlLoop -> Entering function."); }

                            n++;

                            if (n < global.dailyFilePeriods.length) {

                                periodsLoopBody();

                            } else {

                                n = 0;

                                writeDataRanges(onWritten);

                                function onWritten(err) {

                                    try {

                                        if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> processTimePeriods -> controlLoop -> onWritten -> Entering function."); }

                                        if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                                            logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> controlLoop -> onWritten -> err = "+ err.stack);
                                            callBackFunction(err);
                                            return;
                                        }

                                        writeStatusReport(bot.multiPeriodDailyProcessDatetime, advanceTime);

                                    } catch (err) {
                                        logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods ->  controlLoop -> onWritten -> err = "+ err.stack);
                                        callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                                    }
                                }
                            }
                        }
                        catch (err) {
                            logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> periodsControlLoop -> err = "+ err.stack);
                            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                        }
                    }

                }
                catch (err) {
                    logger.write(MODULE_NAME, "[ERROR] start -> processTimePeriods -> err = "+ err.stack);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function writeDataRanges(callBack) {

                try {

                    if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> writeDataRanges -> Entering function."); }

                    let productIndex = 0;
                    productLoopBody();

                    function productLoopBody() {

                        let folderName = bot.products[productIndex].codeName;

                        writeDataRange(contextVariables.dateBeginOfMarket, bot.multiPeriodDailyProcessDatetime, folderName, controlLoop);
                    }

                    function controlLoop() {

                        productIndex++;

                        if (productIndex < bot.products.length) {
                            productLoopBody();
                        } else {
                            callBack(global.DEFAULT_OK_RESPONSE);
                        }
                    }
                }
                catch (err) {
                    logger.write(MODULE_NAME, "[ERROR] start -> writeDataRanges -> err = "+ err.stack);
                    callBack(global.DEFAULT_FAIL_RESPONSE);
                }

            }

            function writeDataRange(pBegin, pEnd, pProductFolder, callBack) {

                try {

                    if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> writeDataRange -> Entering function."); }

                    let dataRange = {
                        begin: pBegin.valueOf(),
                        end: pEnd.valueOf()
                    };

                    let fileContent = JSON.stringify(dataRange);

                    let fileName = '/Data.Range.' + market.assetA + '_' + market.assetB + '.json';
                    let filePath = bot.filePathRoot + "/Output/" + pProductFolder + "/" + bot.process + fileName;

                    fileStorage.createTextFile(global.DEV_TEAM, filePath, fileContent + '\n', onFileCreated);

                    function onFileCreated(err) {

                        if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> writeDataRange -> onFileCreated -> Entering function."); }

                        if (err.result !== global.DEFAULT_OK_RESPONSE.result) {
                            logger.write(MODULE_NAME, "[ERROR] start -> writeDataRange -> onFileCreated -> err = "+ err.stack);
                            callBack(err);
                            return;
                        }

                        if (LOG_FILE_CONTENT === true) {
                            logger.write(MODULE_NAME, "[INFO] start -> writeDataRange -> onFileCreated ->  Content written = " + fileContent);
                        }

                        callBack(global.DEFAULT_OK_RESPONSE);
                    }
                }
                catch (err) {
                    logger.write(MODULE_NAME, "[ERROR] start -> writeDataRange -> err = "+ err.stack);
                    callBack(global.DEFAULT_FAIL_RESPONSE);
                }
            }

            function writeStatusReport(lastFileDate, callBack) {

                if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> writeStatusReport -> Entering function."); }
                if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] start -> writeStatusReport -> lastFileDate = " + lastFileDate); }

                try {

                    let reportKey = bot.devTeam + "-" + bot.codeName + "-" + "Multi-Period-Daily" + "-" + "dataSet.V1";
                    let thisReport = statusDependencies.statusReports.get(reportKey);

                    thisReport.file.lastExecution = bot.currentDaytime;
                    thisReport.file.lastFile = lastFileDate;
                    thisReport.file.interExecutionMemoryArray = interExecutionMemoryArray;
                    thisReport.save(callBack);

                    bot.hasTheBotJustStarted = false;
                }
                catch (err) {
                    logger.write(MODULE_NAME, "[ERROR] start -> writeStatusReport -> err = "+ err.stack);
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }
        }

        catch (err) {
            logger.write(MODULE_NAME, "[ERROR] start -> err = "+ err.stack);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function pad(str, max) {
        str = str.toString();
        return str.length < max ? pad(" " + str, max) : str;
    }
};
