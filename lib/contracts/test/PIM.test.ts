import { expect } from "chai";
import hre from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
const { ethers } = hre;

const EIP712_TYPES = {
  MintCard: [
    { name: "recipient", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "day", type: "uint256" },
    { name: "title", type: "string" },
    { name: "rarity", type: "string" },
    { name: "edition", type: "uint256" },
    { name: "audioUrl", type: "string" },
    { name: "coverUrl", type: "string" },
    { name: "proof", type: "string" },
    { name: "isEcho", type: "bool" },
    { name: "echoGeneration", type: "uint256" },
  ],
};

type MintValue = {
  recipient: string;
  tokenId: number;
  day: number;
  title: string;
  rarity: string;
  edition: number;
  audioUrl: string;
  coverUrl: string;
  proof: string;
  isEcho: boolean;
  echoGeneration: number;
};

/** Sign an EIP-712 mint authorization with the backend minter key. */
async function signMint(
  signer: SignerWithAddress,
  nft: any,
  value: MintValue,
  chainIdOverride?: bigint,
  contractOverride?: string
) {
  const network = await ethers.provider.getNetwork();
  const domain = {
    name: "Poetry in Motion: th3v4ult",
    version: "1",
    chainId: chainIdOverride ?? network.chainId,
    verifyingContract: contractOverride ?? (await nft.getAddress()),
  };
  return signer.signTypedData(domain, EIP712_TYPES, value);
}

/** Positional args for mintCard / mintCardWithSignature. */
function mintArgs(recipient: string, tokenId: number, day = 12) {
  return [
    recipient,
    tokenId,
    day,
    "Flowing Sounds",
    "rare",
    2,
    "https://supabase.co/audio.mp3",
    "https://supabase.co/cover.png",
    "proof_of_first",
    false,
    0,
  ];
}

function mintValue(recipient: string, tokenId: number, day = 12): MintValue {
  return {
    recipient,
    tokenId,
    day,
    title: "Flowing Sounds",
    rarity: "rare",
    edition: 2,
    audioUrl: "https://supabase.co/audio.mp3",
    coverUrl: "https://supabase.co/cover.png",
    proof: "proof_of_first",
    isEcho: false,
    echoGeneration: 0,
  };
}

describe("PIM", function () {
  let nft: any;
  let owner: SignerWithAddress;
  let minter: SignerWithAddress;
  let user: SignerWithAddress;
  let otherUser: SignerWithAddress;

  beforeEach(async function () {
    [owner, minter, user, otherUser] = await ethers.getSigners();

    const PIMFactory = await ethers.getContractFactory("PIM");
    // maxSupply 1000, 7.5% royalty to owner
    nft = await PIMFactory.deploy(owner.address, 1000, owner.address, 750);
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

    it("Should set the supply cap and royalty at deploy", async function () {
      expect(await nft.maxSupply()).to.equal(1000);
      expect(await nft.totalMinted()).to.equal(0);
      expect(await nft.supportsInterface("0x2a55205a")).to.be.true; // ERC-2981
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

      expect(await nft.totalMinted()).to.equal(1);
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

  describe("Supply cap", function () {
    it("Should revert once maxSupply is reached", async function () {
      const PIMFactory = await ethers.getContractFactory("PIM");
      const capped = await PIMFactory.deploy(owner.address, 2, owner.address, 500);
      await capped.waitForDeployment();
      await capped.setMinter(minter.address, true);

      await capped.connect(minter).mintCard(...mintArgs(user.address, 1));
      await capped.connect(minter).mintCard(...mintArgs(user.address, 2));
      expect(await capped.totalMinted()).to.equal(2);
      expect(await capped.supplyRemaining()).to.equal(0);

      await expect(
        capped.connect(minter).mintCard(...mintArgs(user.address, 3))
      ).to.be.revertedWith("Max supply reached");
    });

    it("Should enforce the cap on the signature mint path too", async function () {
      const PIMFactory = await ethers.getContractFactory("PIM");
      const capped = await PIMFactory.deploy(owner.address, 1, owner.address, 500);
      await capped.waitForDeployment();
      await capped.setMinter(minter.address, true);

      await capped.connect(minter).mintCard(...mintArgs(user.address, 1));

      const value = mintValue(user.address, 2);
      const sig = await signMint(minter, capped, value);
      await expect(
        capped.connect(user).mintCardWithSignature(...mintArgs(user.address, 2), sig)
      ).to.be.revertedWith("Max supply reached");
    });
  });

  describe("Royalties (ERC-2981)", function () {
    it("Should return the configured default royalty", async function () {
      const [receiver, amount] = await nft.royaltyInfo(1, 10000);
      expect(receiver).to.equal(owner.address);
      expect(amount).to.equal(750); // 7.5% of 10000
    });

    it("Should allow the owner to update the royalty", async function () {
      await expect(nft.setDefaultRoyalty(otherUser.address, 500))
        .to.emit(nft, "RoyaltyUpdated")
        .withArgs(otherUser.address, 500);
      const [receiver, amount] = await nft.royaltyInfo(1, 20000);
      expect(receiver).to.equal(otherUser.address);
      expect(amount).to.equal(1000); // 5% of 20000
    });

    it("Should fail if a non-owner tries to update the royalty", async function () {
      await expect(
        nft.connect(user).setDefaultRoyalty(user.address, 500)
      ).to.be.reverted;
    });
  });

  describe("Signature-Based Minting (EIP-712)", function () {
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

    function sigCardData(recipient: string): MintValue {
      return {
        recipient,
        tokenId: cardData.tokenId,
        day: cardData.day,
        title: cardData.title,
        rarity: cardData.rarity,
        edition: cardData.edition,
        audioUrl: cardData.audioUrl,
        coverUrl: cardData.coverUrl,
        proof: cardData.proof,
        isEcho: cardData.isEcho,
        echoGeneration: cardData.echoGeneration,
      };
    }

    function sigMintArgs(recipient: string) {
      return [
        recipient,
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
      ];
    }

    it("Should allow user to claim mint via valid backend signature", async function () {
      const value = sigCardData(user.address);
      const signature = await signMint(minter, nft, value);

      await expect(
        nft.connect(user).mintCardWithSignature(...sigMintArgs(user.address), signature)
      )
        .to.emit(nft, "CardMinted")
        .withArgs(cardData.tokenId, user.address, cardData.day, cardData.rarity, cardData.edition);

      expect(await nft.ownerOf(cardData.tokenId)).to.equal(user.address);
    });

    it("Should fail signature mint if a signed parameter was modified", async function () {
      const value = sigCardData(user.address);
      const signature = await signMint(minter, nft, value);

      const tampered = sigMintArgs(user.address);
      tampered[5] = cardData.edition + 1; // edition index in positional args
      await expect(
        nft.connect(user).mintCardWithSignature(...tampered, signature)
      ).to.be.revertedWith("Unauthorized signature");
    });

    it("Should reject a signature bound to a different chain", async function () {
      const value = sigCardData(user.address);
      // Signed for Ethereum mainnet (chainId 1), submitted on hardhat (31337)
      const signature = await signMint(minter, nft, value, 1n);
      await expect(
        nft.connect(user).mintCardWithSignature(...sigMintArgs(user.address), signature)
      ).to.be.revertedWith("Unauthorized signature");
    });

    it("Should reject a signature bound to a different contract", async function () {
      const value = sigCardData(user.address);
      // Signed for some other contract address
      const signature = await signMint(minter, nft, value, undefined, otherUser.address);
      await expect(
        nft.connect(user).mintCardWithSignature(...sigMintArgs(user.address), signature)
      ).to.be.revertedWith("Unauthorized signature");
    });

    it("Should reject a signature from an unauthorized signer", async function () {
      const value = sigCardData(user.address);
      const signature = await signMint(otherUser, nft, value); // not owner/minter
      await expect(
        nft.connect(user).mintCardWithSignature(...sigMintArgs(user.address), signature)
      ).to.be.revertedWith("Unauthorized signature");
    });
  });

  describe("Reentrancy guard", function () {
    it("Should block a reentrant mint via onERC721Received", async function () {
      const AttackerFactory = await ethers.getContractFactory("ReentrantAttacker");
      const attacker = await AttackerFactory.deploy(await nft.getAddress());
      await attacker.waitForDeployment();
      const attackerAddr = await attacker.getAddress();

      // Arm the attacker with a *valid* minter signature for token 999 so the
      // reentrant call passes signature verification and reaches the guard.
      const value999 = mintValue(attackerAddr, 999);
      const sig999 = await signMint(minter, nft, value999);
      await attacker.arm(
        attackerAddr,
        999,
        value999.day,
        value999.title,
        value999.rarity,
        value999.edition,
        value999.audioUrl,
        value999.coverUrl,
        value999.proof,
        value999.isEcho,
        value999.echoGeneration,
        sig999
      );

      // Outer mint triggers onERC721Received -> reentrant mint attempt -> guard reverts -> whole tx reverts
      await expect(
        nft.connect(minter).mintCard(...mintArgs(attackerAddr, 1))
      ).to.be.reverted;

      // Neither the outer nor the reentrant mint landed
      await expect(nft.ownerOf(1)).to.be.reverted;
      await expect(nft.ownerOf(999)).to.be.reverted;
      expect(await nft.totalMinted()).to.equal(0);
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
      coverUrl: "https://supabase.co/cover.png",
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
