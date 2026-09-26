// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/**
 * @notice Test-only malicious ERC721 receiver. When it receives a PIM mint,
 * it attempts to reenter `mintCardWithSignature` using a pre-signed
 * authorization for a second token. Used to prove the reentrancy guard holds.
 */
interface IPIMSignatureMint {
    function mintCardWithSignature(
        address recipient,
        uint256 tokenId,
        uint256 day,
        string calldata title,
        string calldata rarity,
        uint256 edition,
        string calldata audioUrl,
        string calldata coverUrl,
        string calldata proof,
        bool isEcho,
        uint256 echoGeneration,
        bytes calldata signature
    ) external payable;
}

contract ReentrantAttacker is IERC721Receiver {
    IPIMSignatureMint public immutable pim;

    // Pre-signed authorization for the reentrant mint (set by the test)
    address public recipient;
    uint256 public tokenId;
    uint256 public day;
    string public title;
    string public rarity;
    uint256 public edition;
    string public audioUrl;
    string public coverUrl;
    string public proof;
    bool public isEcho;
    uint256 public echoGeneration;
    bytes public sig;

    constructor(address _pim) {
        pim = IPIMSignatureMint(_pim);
    }

    function arm(
        address _recipient,
        uint256 _tokenId,
        uint256 _day,
        string calldata _title,
        string calldata _rarity,
        uint256 _edition,
        string calldata _audioUrl,
        string calldata _coverUrl,
        string calldata _proof,
        bool _isEcho,
        uint256 _echoGeneration,
        bytes calldata _sig
    ) external {
        recipient = _recipient;
        tokenId = _tokenId;
        day = _day;
        title = _title;
        rarity = _rarity;
        edition = _edition;
        audioUrl = _audioUrl;
        coverUrl = _coverUrl;
        proof = _proof;
        isEcho = _isEcho;
        echoGeneration = _echoGeneration;
        sig = _sig;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external override returns (bytes4) {
        // Attempt reentry while the outer mint is still executing
        pim.mintCardWithSignature(
            recipient,
            tokenId,
            day,
            title,
            rarity,
            edition,
            audioUrl,
            coverUrl,
            proof,
            isEcho,
            echoGeneration,
            sig
        );
        return this.onERC721Received.selector;
    }
}
