// Reducer for Workspace
import * as THREE from 'three';
import { v4 as uuid } from 'uuid';
import { generateRandomPathName } from '../../../shared/lib/random-utils';
import api from '../../api';
import log from '../../lib/log';
import workerManager from '../../lib/manager/workerManager';
import {
    CONNECTION_STATUS_CONNECTED,
    EPSILON,
    PROTOCOL_TEXT
} from '../../constants';
import {
    findMachineByName
    // , MACHINE_SERIES
} from '../../constants/machines';
import { logGcodeExport } from '../../lib/gaEvent';
import ThreeUtils from '../../three-extensions/ThreeUtils';
import gcodeBufferGeometryToObj3d from '../../workers/GcodeToBufferGeometry/gcodeBufferGeometryToObj3d';
/* eslint-disable-next-line import/no-cycle */
import { actions as machineActions } from '../machine';
import type { MachineStateUpdateOptions } from './machine-state';


// Actions
const ACTION_SET_STATE = 'WORKSPACE/ACTION_SET_STATE';

export const WORKSPACE_STAGE = {
    EMPTY: 0,
    LOADING_GCODE: 1,
    LOAD_GCODE_SUCCEED: 2,
    LOAD_GCODE_FAILED: 3,
};

const INITIAL_STATE = {
    headType: '',
    toolHead: '',

    isRotate: false,
    uploadState: 'idle', // uploading, uploaded
    renderState: 'idle',
    previewRenderState: 'idle',
    gcodeFile: null,
    activeGcodeFile: null,
    boundingBox: null,
    previewBoundingBox: null,
    gcodeFiles: [],
    modelGroup: new THREE.Group(),
    previewModelGroup: new THREE.Group(),
    renderingTimestamp: 0,
    stage: WORKSPACE_STAGE.EMPTY,
    previewStage: WORKSPACE_STAGE.EMPTY,
    progress: 0,

    // MachineState
    machineIdentifier: '',
    machineSize: { x: 100, y: 100, z: 100 },
};

export const actions = {
    gcodeToArraybufferGeometryCallback: (data) => (dispatch, getState) => {
        const {
            status,
            value,
            renderMethod,
            isDone,
            gcodeFilename,
            isPreview = false,
        } = data;
        switch (status) {
            case 'succeed': {
                const { modelGroup, previewModelGroup } = getState().workspace;
                const { positions, colors, index, indexColors } = value;
                const bufferGeometry = new THREE.BufferGeometry();
                const positionAttribute = new THREE.Float32BufferAttribute(
                    positions.send,
                    3
                );
                const indexAttribute = new THREE.Float32BufferAttribute(
                    index.send,
                    1
                );
                const colorAttribute = new THREE.Uint8BufferAttribute(
                    colors.send,
                    3
                );
                const indexColorAttribute = new THREE.Uint8BufferAttribute(
                    indexColors.send,
                    3
                );
                // this will map the buffer values to 0.0f - +1.0f in the shader
                colorAttribute.normalized = true;
                indexColorAttribute.normalized = true;

                bufferGeometry.setAttribute('position', positionAttribute);
                bufferGeometry.setAttribute('a_color', colorAttribute);
                bufferGeometry.setAttribute('a_index', indexAttribute);
                bufferGeometry.setAttribute(
                    'a_index_color',
                    indexColorAttribute
                );

                const object3D = gcodeBufferGeometryToObj3d(
                    'WORKSPACE',
                    bufferGeometry,
                    renderMethod
                );
                // object3D.material.uniforms.u_visible_index_count.value = 20000;
                object3D.name = `${gcodeFilename}-${uuid()}`;

                if (isPreview) {
                    previewModelGroup.add(object3D);
                } else {
                    modelGroup.add(object3D);
                }
                object3D.position.copy(new THREE.Vector3());

                if (isDone) {
                    const boundingBox = ThreeUtils.computeBoundingBox(object3D);

                    if (isPreview) {
                        dispatch(
                            actions.updateState({
                                previewRenderState: 'rendered',
                                previewBoundingBox: boundingBox,
                                previewStage:
                                    WORKSPACE_STAGE.LOAD_GCODE_SUCCEED,
                            })
                        );
                    } else {
                        dispatch(
                            actions.updateState({
                                renderState: 'rendered',
                                boundingBox: boundingBox,
                                stage: WORKSPACE_STAGE.LOAD_GCODE_SUCCEED,
                            })
                        );
                    }
                }

                dispatch(actions.render());
                break;
            }
            case 'progress': {
                const state = getState().printing;
                if (value - state.progress > 0.01 || value > 1 - EPSILON) {
                    !isPreview
                        && dispatch(actions.updateState({ progress: value }));
                }
                break;
            }
            case 'err': {
                dispatch(
                    actions.updateState({
                        renderState: 'idle',
                        stage: WORKSPACE_STAGE.LOAD_GCODE_FAILED,
                        progress: 1,
                    })
                );
                break;
            }
            default:
                break;
        }
    },

    setGcodePrintingIndex: (index) => (dispatch, getState) => {
        const { modelGroup } = getState().workspace;
        for (const children of modelGroup.children) {
            children.material.uniforms.u_visible_index_count.value = index;
        }
    },

    updateState: (state) => {
        return {
            type: ACTION_SET_STATE,
            state,
        };
    },

    render: () => (dispatch) => {
        dispatch(
            actions.updateState({
                renderingTimestamp: +new Date(),
            })
        );
    },

    /**
     * Upload file to backend.
     * (and add to file transfer)
     *
     * @param file
     * @returns {Function}
     */
    uploadGcodeFileToList: (file) => (dispatch, getState) => {
        const { shouldAutoPreviewGcode } = getState().machine;

        const formData = new FormData();
        formData.append('file', file);

        api.uploadGcodeFile(formData)
            .then((res) => {
                const response = res.body;
                const header = response.gcodeHeader;
                const gcodeFile = {
                    name: file.name,
                    uploadName: response.uploadName,
                    size: file.size,
                    lastModified: file.lastModified,
                    thumbnail: header[';thumbnail'] || '',
                    renderGcodeFileName: file.renderGcodeFileName || file.name,
                    boundingBox: {
                        max: {
                            x: header[';max_x(mm)'],
                            y: header[';max_y(mm)'],
                            z: header[';max_z(mm)'],
                            b: header[';max_b(mm)'],
                        },
                        min: {
                            x: header[';min_x(mm)'],
                            y: header[';min_y(mm)'],
                            z: header[';min_z(mm)'],
                            b: header[';min_b(mm)']
                        }
                    },

                    type: header[';header_type'],
                    tool_head: header[';tool_head'],
                    nozzle_temperature: header[';nozzle_temperature(°C)'],
                    build_plate_temperature: header[';build_plate_temperature(°C)'],
                    work_speed: header[';work_speed(mm/minute)'],
                    estimated_time: header[';estimated_time(s)'],
                    matierial_weight: header[';matierial_weight'],
                    nozzle_1_temperature: header[';nozzle_1_temperature(°C)'],
                    jog_speed: header[';jog_speed(mm/minute)'],
                    power: header[';power(%)'],
                };
                dispatch(actions.addGcodeFiles(gcodeFile));
                shouldAutoPreviewGcode
                    && dispatch(actions.renderPreviewGcodeFile(gcodeFile));
            })
            .catch(() => {
                // Ignore error
            });
    },

    /**
     * Upload file to backend.
     * (and add to file transfer)
     * (and render it)
     *
     * @param file
     * @returns {Function}
     */
    uploadGcodeFile: (file) => (dispatch) => {
        const formData = new FormData();
        formData.append(
            'file',
            file instanceof File ? file : JSON.stringify(file)
        );
        const uploadName = generateRandomPathName(file.name);
        formData.append('uploadName', uploadName);

        api.uploadGcodeFile(formData)
            .then((res) => {
                const response = res.body;
                const header = response.gcodeHeader;
                const gcodeFile = {
                    name: file.name,
                    uploadName: response.uploadName,
                    size: file.size,
                    lastModified: +file.lastModified,
                    thumbnail: header[';thumbnail'] || '',
                    renderGcodeFileName: file.renderGcodeFileName || file.name,
                };
                dispatch(actions.renderGcodeFile(gcodeFile));
            })
            .catch(() => {
                // Ignore error
            });
    },

    clearGcode: (isPreview = false) => (dispatch, getState) => {
        const { modelGroup, previewModelGroup } = getState().workspace;
        if (isPreview) {
            previewModelGroup.remove(...previewModelGroup.children);
        } else {
            modelGroup.remove(...modelGroup.children);
        }
        dispatch(
            actions.updateState({
                renderState: 'idle',
                gcodeFile: null,
                boundingBox: null,
                stage: WORKSPACE_STAGE.EMPTY,
                progress: 0,
            })
        );
        dispatch(actions.render());
    },

    // updateGcodeFilename: (name, x = 0, y = 0, z = 0) => (dispatch, getState) => {
    //     const { modelGroup, gcodeFilenameObject } = getState().workspace;
    //     gcodeFilenameObject && modelGroup.remove(gcodeFilenameObject);
    //     const textSize = 5;
    //     const gcodeFilenameObjectTmp = new TextSprite({
    //         x: x,
    //         y: y,
    //         z: z,
    //         size: textSize,
    //         text: `G-code: ${name}`,
    //         color: colornames('gray 44'), // grid color
    //         opacity: 0.5
    //     });
    //     modelGroup.add(gcodeFilenameObjectTmp);
    //     dispatch(actions.updateState({
    //         gcodeFilenameObject: gcodeFilenameObjectTmp
    //     }));
    // },

    renderGcode: (name, gcode, shouldRenderGcode = false, isRepeat = false) => (
        dispatch
    ) => {
        dispatch(actions.clearGcode());
        const blob = new Blob([gcode], { type: 'text/plain' });
        const file = new File([blob], name);

        const formData = new FormData();
        formData.append('file', file);
        api.uploadFile(formData).then((res) => {
            const response = res.body;
            const gcodeFile = {
                name: file.name,
                uploadName: response.uploadName,
                size: file.size,
                lastModified: +file.lastModified,
                thumbnail: '',
            };
            dispatch(
                actions.renderGcodeFile(gcodeFile, !isRepeat, shouldRenderGcode)
            );
        });
    },

    renderGcodeFile: (
        gcodeFile,
        needToList = true,
        shouldRenderGcode = false
    ) => async (dispatch, getState) => {
        const { shouldAutoPreviewGcode } = getState().machine;
        const { headType, isRotate } = getState().workspace;

        // const oldGcodeFile = getState().workspace.gcodeFile;
        if (needToList) {
            dispatch(actions.addGcodeFiles(gcodeFile));
        }
        // if (oldGcodeFile !== null && oldGcodeFile.uploadName === gcodeFile.uploadName) {
        //     return;
        // }
        if (shouldRenderGcode) {
            await dispatch(actions.clearGcode());
            await dispatch(
                actions.updateState({
                    gcodeFile,
                    stage: WORKSPACE_STAGE.LOADING_GCODE,
                    renderState: 'rendering',
                    progress: 0,
                })
            );
            // TODO:  used for serialport
            await dispatch(actions.loadGcode(gcodeFile));
            logGcodeExport(headType, 'workspace', isRotate);

            workerManager.gcodeToArraybufferGeometry(
                { func: 'WORKSPACE', gcodeFilename: gcodeFile.uploadName },
                (data) => {
                    dispatch(actions.gcodeToArraybufferGeometryCallback(data));
                }
            );
        } else {
            shouldAutoPreviewGcode
                && dispatch(actions.renderPreviewGcodeFile(gcodeFile));
            await dispatch(
                actions.updateState({
                    boundingBox: gcodeFile?.boundingBox,
                })
            );
        }
    },

    renderPreviewGcodeFile: (gcodeFile) => async (dispatch) => {
        await dispatch(actions.clearGcode(true));
        dispatch(
            actions.updateState({
                previewStage: WORKSPACE_STAGE.LOADING_GCODE,
                previewRenderState: 'rendering',
                progress: 0,
            })
        );
        workerManager.gcodeToArraybufferGeometry(
            {
                func: 'WORKSPACE',
                gcodeFilename: gcodeFile.uploadName,
                isPreview: true,
            },
            (data) => {
                dispatch(actions.gcodeToArraybufferGeometryCallback(data));
            }
        );
    },

    addGcodeFiles: (fileInfo) => (dispatch, getState) => {
        const { gcodeFiles } = getState().workspace;
        const files = [];
        fileInfo.isRenaming = false;
        fileInfo.newName = fileInfo.name;
        files.push(fileInfo);
        let added = 1,
            i = 0;
        while (added < 5 && i < gcodeFiles.length) {
            const gcodeFile = gcodeFiles[i];
            // G-code file with the same uploadName will be replaced with current one
            if (gcodeFile.uploadName !== fileInfo.uploadName) {
                files.push(gcodeFile);
                added++;
            }
            i++;
        }
        dispatch(
            actions.updateState({
                boundingBox: fileInfo.boundingBox,
                gcodeFiles: files,
            })
        );
    },

    renameGcodeFile: (uploadName, newName = null, isRenaming = null) => (
        dispatch,
        getState
    ) => {
        const { gcodeFiles } = getState().workspace;
        const find = gcodeFiles.find((e) => e.uploadName === uploadName);
        if (!find) {
            return;
        }
        if (newName !== null) {
            find.newName = newName;
            find.name = newName;
            find.renderGcodeFileName = newName;
        }
        if (isRenaming !== null) {
            find.isRenaming = isRenaming;
        }
        const files = gcodeFiles.map((e) => e);

        dispatch(
            actions.updateState({
                gcodeFiles: files,
            })
        );
    },

    removeGcodeFile: (fileInfo) => (dispatch, getState) => {
        const { gcodeFiles } = getState().workspace;

        const files = gcodeFiles.filter((item) => {
            return item.uploadName !== fileInfo.uploadName;
        });

        dispatch(
            actions.updateState({
                gcodeFiles: files,
            })
        );
    },

    /**
     * Tell controller to load G-code.
     *
     * @param gcodeFile An object that contains information of G-code file.
     * @returns {Promise}
     */
    loadGcode: (gcodeFile) => async (dispatch, getState) => {
        const { connectionStatus, server } = getState().machine;
        gcodeFile = gcodeFile || getState().workspace.gcodeFile;
        if (
            connectionStatus !== CONNECTION_STATUS_CONNECTED
            || gcodeFile === null
        ) {
            return;
        }

        dispatch(actions.updateState({ uploadState: 'uploading' }));
        try {
            await api.loadGCode({
                port: server?.port,
                dataSource: PROTOCOL_TEXT,
                uploadName: gcodeFile.uploadName,
            });

            dispatch(actions.updateState({ uploadState: 'uploaded' }));
        } catch (e) {
            dispatch(actions.updateState({ uploadState: 'idle' }));

            log.error('Failed to upload G-code to controller');
        }
    },

    unloadGcode: () => (dispatch) => {
        dispatch(machineActions.executeGcode(null, null, 'gcode:unload'));
        dispatch(actions.updateState({ uploadState: 'idle' }));
    },

    updateMachineState: (options: MachineStateUpdateOptions) => (dispatch) => {
        console.log('updateMachineState', options);
        if (options.machineIdentifier) {
            const machine = findMachineByName(options.machineIdentifier);
            if (machine) {
                options.machineSize = {
                    x: machine.metadata.size.x,
                    y: machine.metadata.size.y,
                    z: machine.metadata.size.z,
                };
            }
        }
        dispatch(actions.updateState(options));
    },
};

export default function reducer(state = INITIAL_STATE, action) {
    switch (action.type) {
        case ACTION_SET_STATE: {
            return Object.assign({}, state, { ...action.state });
        }

        default:
            return state;
    }
}