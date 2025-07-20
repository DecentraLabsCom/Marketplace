import React from "react";
import Carrousel from "@/components/Carrousel";

const ProviderLabItem = React.memo(function ProviderLabItem({ lab, onEdit, onCollect, onDelete, onList, onUnlist }) {
  return (
    <div className="p-4 border rounded shadow max-w-4xl mx-auto">
        <h3 className="text-lg font-bold text-center mb-4">{lab.name}</h3>
        <div className="w-full flex">
            <div className="w-2/3">
                <Carrousel lab={lab} maxHeight={200} />
            </div>
            <div className="h-[200px] ml-6 flex flex-col flex-1 items-stretch text-white">
                <button onClick={onEdit}
                className="relative bg-[#715c8c] h-1/4 overflow-hidden group hover:font-bold"
                >
                    Edit
                    <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                    border-b-[#5e4a7a] border-l-[7em] border-l-transparent opacity-0 
                    group-hover:opacity-100 transition-opacity duration-300" />
                </button>
                <button onClick={() => onCollect(lab.id)}
                className="relative bg-[#bcc4fc] h-1/4 overflow-hidden group hover:font-bold"
                >
                    Collect
                    <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                    border-b-[#94a6cc] border-l-[7em] border-l-transparent opacity-0 
                    group-hover:opacity-100 transition-opacity duration-300" />
                </button>
                <button onClick={() => onList(lab.id)} disabled
                className="relative bg-[#759ca8] h-1/4 overflow-hidden group hover:font-bold
                            opacity-50 cursor-not-allowed"
                >
                    List
                    <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                    border-b-[#5f7a91] border-l-[7em] border-l-transparent opacity-0 
                    group-hover:opacity-100 transition-opacity duration-300" />
                </button>
                <button onClick={() => onUnlist(lab.id)} disabled
                className="relative bg-[#7583ab] h-1/4 overflow-hidden group hover:font-bold
                            opacity-50 cursor-not-allowed"
                >
                    Unlist
                    <span className="absolute bottom-0 right-0 size-0 border-b-[3.15em] 
                    border-b-[#5f6a91] border-l-[7em] border-l-transparent opacity-0 
                    group-hover:opacity-100 transition-opacity duration-300" />
                </button>
            </div>
        </div>
        <div className="w-2/3 flex justify-center mt-4">
            <button onClick={() => onDelete(lab.id)}
                className="bg-[#a87583] text-white w-20 py-2 rounded hover:font-bold 
                hover:bg-[#8a5c66]"
            >
                Delete
            </button>
        </div>
    </div>
  );
});

export default ProviderLabItem;
