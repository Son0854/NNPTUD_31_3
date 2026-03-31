var express = require("express");
var router = express.Router();
let { CheckLogin } = require('../utils/authHandler');
let messageModel = require('../schemas/messages');
let { uploadFile } = require('../utils/uploadHandler');
let mongoose = require('mongoose');

router.get('/', CheckLogin, async function (req, res, next) {
    try {
        let currentUserId = req.user._id;


        let lastMessages = await messageModel.aggregate([
            {

                $match: {
                    $or: [
                        { from: new mongoose.Types.ObjectId(currentUserId) },
                        { to: new mongoose.Types.ObjectId(currentUserId) }
                    ]
                }
            },
            {

                $addFields: {
                    partner: {
                        $cond: {
                            if: { $eq: ["$from", new mongoose.Types.ObjectId(currentUserId)] },
                            then: "$to",
                            else: "$from"
                        }
                    }
                }
            },
            {

                $sort: { createdAt: -1 }
            },
            {

                $group: {
                    _id: "$partner",
                    lastMessage: { $first: "$$ROOT" }
                }
            },
            {

                $replaceRoot: { newRoot: "$lastMessage" }
            },
            {

                $sort: { createdAt: -1 }
            },
            {

                $lookup: {
                    from: "users",
                    localField: "from",
                    foreignField: "_id",
                    as: "from",
                    pipeline: [
                        { $project: { username: 1, email: 1, avatarUrl: 1 } }
                    ]
                }
            },
            {

                $unwind: { path: "$from", preserveNullAndEmptyArrays: true }
            },
            {

                $lookup: {
                    from: "users",
                    localField: "to",
                    foreignField: "_id",
                    as: "to",
                    pipeline: [
                        { $project: { username: 1, email: 1, avatarUrl: 1 } }
                    ]
                }
            },
            {
                $unwind: { path: "$to", preserveNullAndEmptyArrays: true }
            }
        ]);

        res.send(lastMessages);
    } catch (err) {
        res.status(400).send({ message: err.message });
    }
});


router.post('/', CheckLogin, uploadFile.single('file'), async function (req, res, next) {
    try {
        let currentUserId = req.user._id;
        let { to, text } = req.body;


        if (!to || !mongoose.Types.ObjectId.isValid(to)) {
            return res.status(400).send({ message: "Người nhận (to) không hợp lệ" });
        }


        if (currentUserId.toString() === to.toString()) {
            return res.status(400).send({ message: "Không thể gửi tin nhắn cho chính mình" });
        }

        let messageContent;

        if (req.file) {

            messageContent = {
                type: "file",
                text: req.file.path
            };
        } else {

            if (!text || text.trim() === '') {
                return res.status(400).send({ message: "Nội dung tin nhắn (text) không được rỗng" });
            }
            messageContent = {
                type: "text",
                text: text.trim()
            };
        }

        let newMessage = new messageModel({
            from: currentUserId,
            to: to,
            messageContent: messageContent
        });

        await newMessage.save();
        await newMessage.populate('from', 'username email avatarUrl');
        await newMessage.populate('to', 'username email avatarUrl');

        res.status(201).send(newMessage);
    } catch (err) {
        res.status(400).send({ message: err.message });
    }
});
router.get('/:userID', CheckLogin, async function (req, res, next) {
    try {
        let currentUserId = req.user._id;
        let targetUserId = req.params.userID;


        if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
            return res.status(400).send({ message: "userID không hợp lệ" });
        }


        let messages = await messageModel.find({
            $or: [
                { from: currentUserId, to: targetUserId },
                { from: targetUserId, to: currentUserId }
            ]
        })
            .populate('from', 'username email avatarUrl')
            .populate('to', 'username email avatarUrl')
            .sort({ createdAt: 1 });

        res.send(messages);
    } catch (err) {
        res.status(400).send({ message: err.message });
    }
});

module.exports = router;
