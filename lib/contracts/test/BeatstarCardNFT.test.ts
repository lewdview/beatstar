import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;
import { BeatstarCardNFT } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("BeatstarCardNFT", function () {
  let nft: any;
  let owner: SignerWithAddress;
  let minter: SignerWithAddress;
  let user: SignerWithAddress;
  let otherUser: SignerWithAddress;

  beforeEach(async function () {
    [owner, minter, user, otherUser] = await ethers.getSigners();

    const BeatstarCardNFTFactory = await ethers.getContractFactory("BeatstarCardNFT");
    nft = await BeatstarCardNFTFactory.deploy(owner.address);
    await nft.waitForDeployment();

    // Set minter role
    await nft.setMinter(minter.address, true);
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await nft.owner()).to.equal(owner.address);
    });

    it("Should return correct name and symbol", async function () {
      expect(await nft.name()).to.equal("Poetry in Motion: th3v4ult");
      expect(await nft.symbol()).to.equal("PIM");
    });
  });

  describe("Minter Management", function () {
    it("Should authorize a minter", async function () {
      expect(await nft.isMinter(minter.address)).to.be.true;
    });

    it("Should allow owner to revoke minter status", async function () {
      await nft.setMinter(minter.address, false);
      expect(await nft.isMinter(minter.address)).to.be.false;
    });

    it("Should fail if non-owner tries to set minter status", async function () {
      await expect(
        nft.connect(user).setMinter(otherUser.address, true)
      ).to.be.reverted;
    });
  });

  describe("Minting", function () {
    const cardData = {
      tokenId: 1,
      day: 12,
      title: "Flowing Sounds",
      rarity: "rare",
      edition: 2,
      audioUrl: "https://supabase.co/audio.mp3",
      coverUrl: "https://supabase.co/cover.png",
      proof: "proof_of_first",
      isEcho: false,
      echoGeneration: 0,
    };

    it("Should allow owner or minter to direct-mint a card", async function () {
      // Minter mints card to user
      await nft.connect(minter).mintCard(
        user.address,
        cardData.tokenId,
        cardData.day,
        cardData.title,
        cardData.rarity,
        cardData.edition,
        cardData.audioUrl,
        cardData.coverUrl,
        cardData.proof,
        cardData.isEcho,
        cardData.echoGeneration
      );

      expect(await nft.ownerOf(cardData.tokenId)).to.equal(user.address);

      // Check card properties
      const card = await nft.cards(cardData.tokenId);
      expect(card.day).to.equal(cardData.day);
      expect(card.title).to.equal(cardData.title);
      expect(card.rarity).to.equal(cardData.rarity);
      expect(card.edition).to.equal(cardData.edition);
      expect(card.audioUrl).to.equal(cardData.audioUrl);
      expect(card.coverUrl).to.equal(cardData.coverUrl);
      expect(card.proof).to.equal(cardData.proof);
      expect(card.isEcho).to.equal(cardData.isEcho);
      expect(card.echoGeneration).to.equal(cardData.echoGeneration);
    });

    it("Should fail if a non-minter tries to direct-mint a card", async function () {
      await expect(
        nft.connect(user).mintCard(
          otherUser.address,
          cardData.tokenId,
          cardData.day,
          cardData.title,
          cardData.rarity,
          cardData.edition,
          cardData.audioUrl,
          cardData.coverUrl,
          cardData.proof,
          cardData.isEcho,
          cardData.echoGeneration
        )
      ).to.be.revertedWith("Not authorized: must be owner or minter");
    });
  });

  describe("Signature-Based Minting", function () {
    const cardData = {
      tokenId: 100,
      day: 47,
      title: "Neon Echoes",
      rarity: "legendary",
      edition: 1,
      audioUrl: "https://supabase.co/audio-47.mp3",
      coverUrl: "https://supabase.co/cover-47.png",
      proof: "none",
      isEcho: true,
      echoGeneration: 1,
    };

    it("Should allow user to claim mint via valid backend signature", async function () {
      // 1. Hash parameters in Javascript
      const messageHash = ethers.solidityPackedKeccak256(
        [
          "address",
          "uint256",
          "uint256",
          "string",
          "string",
          "uint256",
          "string",
          "string",
          "string",
          "bool",
          "uint256",
        ],
        [
          user.address,
          cardData.tokenId,
          cardData.day,
          cardData.title,
          cardData.rarity,
          cardData.edition,
          cardData.audioUrl,
          cardData.coverUrl,
          cardData.proof,
          cardData.isEcho,
          cardData.echoGeneration,
        ]
      );

      // 2. Sign the message hash using the authorized minter wallet
      const signature = await minter.signMessage(ethers.getBytes(messageHash));

      // 3. User submits signature to contract
      await expect(
        nft.connect(user).mintCardWithSignature(
          user.address,
          cardData.tokenId,
          cardData.day,
          cardData.title,
          cardData.rarity,
          cardData.edition,
          cardData.audioUrl,
          cardData.coverUrl,
          cardData.proof,
          cardData.isEcho,
          cardData.echoGeneration,
          signature
        )
      )
        .to.emit(nft, "CardMinted")
        .withArgs(cardData.tokenId, user.address, cardData.day, cardData.rarity, cardData.edition);

      expect(await nft.ownerOf(cardData.tokenId)).to.equal(user.address);
    });

    it("Should fail signature mint if signature was modified", async function () {
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "string", "string", "uint256", "string", "string", "string", "bool", "uint256"],
        [user.address, cardData.tokenId, cardData.day, cardData.title, cardData.rarity, cardData.edition, cardData.audioUrl, cardData.coverUrl, cardData.proof, cardData.isEcho, cardData.echoGeneration]
      );

      const signature = await minter.signMessage(ethers.getBytes(messageHash));

      // Attempt to mint with modified parameter (e.g. higher edition)
      await expect(
        nft.connect(user).mintCardWithSignature(
          user.address,
          cardData.tokenId,
          cardData.day,
          cardData.title,
          cardData.rarity,
          cardData.edition + 1, // Modified!
          cardData.audioUrl,
          cardData.coverUrl,
          cardData.proof,
          cardData.isEcho,
          cardData.echoGeneration,
          signature
        )
      ).to.be.revertedWith("Unauthorized signature");
    });
  });

  describe("On-Chain Metadata (tokenURI)", function () {
    const cardData = {
      tokenId: 55,
      day: 5,
      title: "Cybernetic Rhymes",
      rarity: "mythic",
      edition: 1,
      audioUrl: "https://supabase.co/audio-5.mp3",
      coverUrl: "https://supabase.co/cover-5.png",
      proof: "proof_of_first",
      isEcho: false,
      echoGeneration: 0,
    };

    it("Should generate correct dynamic base64 JSON metadata", async function () {
      await nft.connect(minter).mintCard(
        user.address,
        cardData.tokenId,
        cardData.day,
        cardData.title,
        cardData.rarity,
        cardData.edition,
        cardData.audioUrl,
        cardData.coverUrl,
        cardData.proof,
        cardData.isEcho,
        cardData.echoGeneration
      );

      const uri = await nft.tokenURI(cardData.tokenId);
      expect(uri.startsWith("data:application/json;base64,")).to.be.true;

      // Extract and decode base64
      const base64Data = uri.split(",")[1];
      const decodedJson = Buffer.from(base64Data, "base64").toString("utf-8");
      const metadata = JSON.parse(decodedJson);

      // Verify structure
      expect(metadata.name).to.equal("Poetry in Motion: th3v4ult - Day 005 : Cybernetic Rhymes");
      expect(metadata.description).to.equal("Poetry in Motion: th3v4ult Gen 0 Archive - Day 5 of 365.");
      expect(metadata.image).to.equal(cardData.coverUrl);
      expect(metadata.animation_url).to.equal(cardData.audioUrl);

      // Verify traits
      const traits = metadata.attributes;
      expect(traits).to.deep.include({ trait_type: "Day", value: cardData.day });
      expect(traits).to.deep.include({ trait_type: "Rarity", value: cardData.rarity });
      expect(traits).to.deep.include({ trait_type: "Edition", value: cardData.edition });
      expect(traits).to.deep.include({ trait_type: "Proof", value: cardData.proof });
      expect(traits).to.deep.include({ trait_type: "Lifecycle", value: "original" });
      expect(traits).to.deep.include({ trait_type: "Echo Generation", value: cardData.echoGeneration });
    });
  });
});
