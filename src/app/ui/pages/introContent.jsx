import React from 'react';

const printIntroStepOne = (text) => (
    <div>
        {text}
    </div>
);

const printIntroStepTwo = (text) => (
    <div>
        {text}
    </div>
);

const printIntroStepThree = (text1, text2, text3) => (
    <div>
        <div>{text1}</div>
        <div>{text2} <img src="/resources/images/guide-tours/icon_setting_32x32.png" alt="" className="width-32" /> {text3}</div>
    </div>
);

const printIntroStepFour = (text1, text2) => (
    <div>
        <div>{text1}</div>
        <div>{text2}</div>
        <img src="/resources/images/guide-tours/printing-preview.png" alt="" className="width-120" />
    </div>
);

const printIntroStepFive = (text1) => (
    <div>
        {text1}
    </div>
);

const printIntroStepSix = (text1) => (
    <div>
        {text1}
    </div>
);

const laserCncIntroStepOne = (text1, text2, text3) => {
    return (
        <div className="laser-intro-one-content">
            <div className="top-content">
                <div>{text1}</div>
                <div>{text2}</div>
                <img src="/resources/images/guide-tours/pic_job_setup_3aix_size_102x102.png" alt="" className="width-102 job-setup-img" />
            </div>
            <div className="bottom-content">
                <div>{text3}</div>
                <img src="/resources/images/guide-tours/pic_job_setup_3aix_zero_102x102.png" alt="" className="width-102 job-setup-img" />
            </div>
        </div>
    );
};
const laserCncIntroStepTwo = (text) => (
    <div>
        {text}
    </div>
);
const laserCncIntroStepFive = (text1, text2, text3) => {
    return (
        <div>
            <div>{text1}</div>
            <div>{text2}</div>
            <div className="laser-cnc-intro-step-five-bottom">
                <img src="/resources/images/guide-tours/pic_object_pressed_216x80.png" alt="" className="process-img" />
                <div className="text-3-wrapper">
                    <div className="text-3">{text3}</div>
                </div>
            </div>
        </div>
    );
};
const laserCncIntroStepSix = (text1, text2, imgSrc) => {
    return (
        <div>
            <div>{text1}</div>
            <div>{text2}</div>
            <img src={imgSrc} alt="" className="width-120 margin-top-8 preview-img" />
        </div>
    );
};

const cncIntroStepTwo = (text) => (
    <div>
        {text}
    </div>
);

const laser4AxisStepOne = (text1, text2, text3) => {
    return (
        <div className="laser-intro-one-content-4-axis">
            <div className="top-content">
                <div>{text1}</div>
                <div>{text2}</div>
                <img src="/resources/images/guide-tours/pic_job_setup_4aix_size_330x128.png" alt="" className="intro-4-axis-big-img" />
            </div>
            <div className="bottom-content">
                <div>{text3}</div>
                <img src="/resources/images/guide-tours/pic_job_setup_4aix_zero_116x128.png" alt="" className="job-setup-img width-120" />
            </div>
        </div>
    );
};

const cnc4AxisStepOne = (text1, text2, text3) => {
    return (
        <div className="laser-intro-one-content-4-axis">
            <div className="top-content">
                <div>{text1}</div>
                <div>{text2}</div>
                <img src="/resources/images/guide-tours/pic_job_setup_4aix_size_330x128.png" alt="" className="intro-4-axis-big-img" />
            </div>
            <div className="bottom-content">
                <div>{text3}</div>
                <img src="/resources/images/guide-tours/pic_job_setup_4aix_zero_116x128.png" alt="" className="job-setup-img width-120" />
            </div>
        </div>
    );
};

export {
    printIntroStepOne,
    printIntroStepTwo,
    printIntroStepThree,
    printIntroStepFour,
    printIntroStepFive,
    printIntroStepSix,
    laserCncIntroStepOne,
    laserCncIntroStepTwo,
    laserCncIntroStepFive,
    laserCncIntroStepSix,
    cncIntroStepTwo,
    laser4AxisStepOne,
    cnc4AxisStepOne
};