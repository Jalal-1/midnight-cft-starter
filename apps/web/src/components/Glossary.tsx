import { GLOSSARY, GLOSSARY_ORDER } from '../midnight/glossary';
import { Modal } from './ui';

export function Glossary({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="What the fields mean" onClose={onClose}>
      <p className="mb-4 text-xs text-slate-400">
        Wording follows the documentation inside OpenZeppelin's ConfidentialFungibleToken module and this template's
        wrapper contract (packages/contract/src/cft.compact).
      </p>
      <dl className="flex flex-col gap-4">
        {GLOSSARY_ORDER.map((id) => (
          <div key={id} className="rounded-xl border border-night-700 bg-night-800/60 p-3">
            <dt className="text-sm font-semibold text-slate-50">{GLOSSARY[id].title}</dt>
            <dd className="mt-1 text-sm text-slate-300">{GLOSSARY[id].long}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
