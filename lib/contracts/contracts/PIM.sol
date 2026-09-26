// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/**
 * @title PIM
 * @notice Official NFT smart contract for "Poetry in Motion: th3v4ult" (PIM) on Base.
 * Stores card attributes and music stream URLs on-chain and generates dynamic
 * metadata fully on-chain.
 *
 * @dev Hardening (pre-mainnet):
 *  1. On-chain supply cap — `maxSupply` is immutable and enforced on every mint,
 *     so no backend bug or compromised minter key can mint past the cap.
 *  2. ERC-2981 royalties — marketplaces can read `royaltyInfo` for creator fees.
 *  3. EIP-712 signatures — mint authorizations are bound to this chain and this
 *     contract address via the domain separator, so a signature cannot be replayed
 *     on another chain or against a copy of this contract. Replay of the exact
 *     same authorization is a no-op because each tokenId can only be minted once.
 *  4. Reentrancy guard — both mint paths are `nonReentrant` because `_safeMint`
 *     calls `onERC721Received` on contract recipients, which is a reentry vector.
 */
contract PIM is ERC721, ERC2981, Ownable, ReentrancyGuard, EIP712 {
    using Strings for uint256;

    struct Card {
        uint256 day;
        string title;
        string rarity;
        uint256 edition;
        string audioUrl;       // URL to the music stream (animation_url in metadata)
        string coverUrl;       // URL to the card artwork (image in metadata)
        string proof;          // Special verification proof (e.g. proof_of_first)
        bool isEcho;           // Lifecycle echo flag
        uint256 echoGeneration;// Echo generation index
    }

    /// @notice EIP-712 typehash for signature-based mint authorizations.
    bytes32 private constant MINT_TYPEHASH = keccak256(
        "MintCard(address recipient,uint256 tokenId,uint256 day,string title,string rarity,uint256 edition,string audioUrl,string coverUrl,string proof,bool isEcho,uint256 echoGeneration)"
    );

    /// @notice Hard cap on total mints. Immutable — set once at deploy time.
    uint256 public immutable maxSupply;

    /// @notice Number of tokens minted so far (across both mint paths).
    uint256 public totalMinted;

    // Mapping from tokenId to Card details
    mapping(uint256 => Card) public cards;

    // Mapping of authorized backend minters
    mapping(address => bool) public isMinter;

    // Events
    event CardMinted(
        uint256 indexed tokenId,
        address indexed recipient,
        uint256 indexed day,
        string rarity,
        uint256 edition
    );
    event MinterStatusUpdated(address indexed minter, bool status);
    event RoyaltyUpdated(address indexed receiver, uint96 bps);

    modifier onlyOwnerOrMinter() {
        require(msg.sender == owner() || isMinter[msg.sender], "Not authorized: must be owner or minter");
        _;
    }

    constructor(
        address initialOwner,
        uint256 _maxSupply,
        address royaltyReceiver,
        uint96 royaltyBps
    )
        ERC721("Poetry in Motion: th3v4ult", "PIM")
        Ownable(initialOwner)
        EIP712("Poetry in Motion: th3v4ult", "1")
    {
        require(_maxSupply > 0, "maxSupply must be > 0");
        maxSupply = _maxSupply;
        _setDefaultRoyalty(royaltyReceiver, royaltyBps);
        emit RoyaltyUpdated(royaltyReceiver, royaltyBps);
    }

    /**
     * @notice Set minter status for a server backend/operator wallet.
     */
    function setMinter(address minter, bool status) external onlyOwner {
        isMinter[minter] = status;
        emit MinterStatusUpdated(minter, status);
    }

    /**
     * @notice Update the default ERC-2981 royalty (receiver and basis points).
     * Pass address(0) as receiver to remove royalties entirely.
     */
    function setDefaultRoyalty(address receiver, uint96 bps) external onlyOwner {
        _setDefaultRoyalty(receiver, bps);
        emit RoyaltyUpdated(receiver, bps);
    }

    /**
     * @notice Remaining mintable supply under the cap.
     */
    function supplyRemaining() external view returns (uint256) {
        return maxSupply - totalMinted;
    }

    /**
     * @notice Shared mint logic: enforces the supply cap, mints, records the card.
     */
    function _mintCard(
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
        uint256 echoGeneration
    ) internal {
        require(totalMinted < maxSupply, "Max supply reached");
        totalMinted += 1;
        _safeMint(recipient, tokenId);
        cards[tokenId] = Card({
            day: day,
            title: title,
            rarity: rarity,
            edition: edition,
            audioUrl: audioUrl,
            coverUrl: coverUrl,
            proof: proof,
            isEcho: isEcho,
            echoGeneration: echoGeneration
        });
        emit CardMinted(tokenId, recipient, day, rarity, edition);
    }

    /**
     * @notice Direct administrative mint by owner or authorized minter.
     * Useful for backend-sponsored gas-free minting.
     */
    function mintCard(
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
        uint256 echoGeneration
    ) external onlyOwnerOrMinter nonReentrant {
        _mintCard(
            recipient, tokenId, day, title, rarity, edition,
            audioUrl, coverUrl, proof, isEcho, echoGeneration
        );
    }

    /**
     * @notice Signature-based minting where the user calls the contract and pays gas,
     * providing an EIP-712 signature generated by the authorized backend.
     *
     * @dev The signed typed data is bound to this chain ID and this contract
     * address by the EIP-712 domain separator, so authorizations cannot be
     * replayed on other chains or contract copies. Replaying the identical
     * authorization is harmless: the tokenId is already taken and `_safeMint`
     * reverts.
     *
     * Backend signing (ethers v6):
     *   const domain = { name: "Poetry in Motion: th3v4ult", version: "1",
     *                    chainId: 8453, verifyingContract: PIM_ADDRESS };
     *   const types = { MintCard: [
     *     { name: "recipient", type: "address" }, { name: "tokenId", type: "uint256" },
     *     { name: "day", type: "uint256" }, { name: "title", type: "string" },
     *     { name: "rarity", type: "string" }, { name: "edition", type: "uint256" },
     *     { name: "audioUrl", type: "string" }, { name: "coverUrl", type: "string" },
     *     { name: "proof", type: "string" }, { name: "isEcho", type: "bool" },
     *     { name: "echoGeneration", type: "uint256" } ] };
     *   const signature = await backendSigner.signTypedData(domain, types, value);
     */
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
    ) external payable nonReentrant {
        // 1. Recreate the EIP-712 struct hash of the mint authorization
        bytes32 structHash = keccak256(
            abi.encode(
                MINT_TYPEHASH,
                recipient,
                tokenId,
                day,
                keccak256(bytes(title)),
                keccak256(bytes(rarity)),
                edition,
                keccak256(bytes(audioUrl)),
                keccak256(bytes(coverUrl)),
                keccak256(bytes(proof)),
                isEcho,
                echoGeneration
            )
        );

        // 2. Bind to this chain + this contract via the domain separator
        bytes32 digest = _hashTypedDataV4(structHash);

        // 3. Recover the signer and verify authorization
        address signer = ECDSA.recover(digest, signature);
        require(
            signer == owner() || isMinter[signer],
            "Unauthorized signature"
        );

        // 4. Mint the NFT and record parameters
        _mintCard(
            recipient, tokenId, day, title, rarity, edition,
            audioUrl, coverUrl, proof, isEcho, echoGeneration
        );
    }

    /**
     * @notice ERC-165 support for ERC721 + ERC-2981.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @notice Dynamic tokenURI function that outputs base64-encoded metadata fully on-chain.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        Card memory card = cards[tokenId];

        // Zero pad the day index for naming structure: e.g. Day 001
        string memory dayStr = card.day.toString();
        string memory paddedDay = card.day < 10 
            ? string(abi.encodePacked("00", dayStr)) 
            : (card.day < 100 ? string(abi.encodePacked("0", dayStr)) : dayStr);

        // Build base JSON properties
        bytes memory json = abi.encodePacked(
            '{"name": "Poetry in Motion: th3v4ult - Day ', paddedDay, ' : ', card.title, '",',
            '"description": "Poetry in Motion: th3v4ult Gen 0 Archive - Day ', dayStr, ' of 365.",',
            '"image": "', card.coverUrl, '",',
            '"animation_url": "', card.audioUrl, '",',
            '"attributes": ['
        );

        // Build attributes structure
        bytes memory attrs = abi.encodePacked(
            '{"trait_type": "Day", "value": ', dayStr, '},',
            '{"trait_type": "Rarity", "value": "', card.rarity, '"},',
            '{"trait_type": "Edition", "value": ', card.edition.toString(), '},',
            '{"trait_type": "Proof", "value": "', card.proof, '"},',
            '{"trait_type": "Lifecycle", "value": "', card.isEcho ? "echo" : "original", '"},',
            '{"trait_type": "Echo Generation", "value": ', card.echoGeneration.toString(), '}'
        );

        bytes memory jsonClosing = abi.encodePacked(
            ']}'
        );

        // Encode JSON to base64
        string memory base64Json = Base64.encode(
            abi.encodePacked(json, attrs, jsonClosing)
        );

        return string(abi.encodePacked("data:application/json;base64,", base64Json));
    }
}
