import { NETWORKS, NETWORK_IDS, isNetworkId } from '../midnight/networks';
import { useWallet } from '../midnight/useWallet';

export function NetworkSelect() {
  const { networkId, setNetworkId, state } = useWallet();
  const locked = state.status === 'connecting' || state.status === 'connected';
  const info = NETWORKS[networkId];

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="network" className="text-xs font-medium uppercase tracking-wider text-slate-400">
        Network
      </label>
      <select
        id="network"
        value={networkId}
        disabled={locked}
        onChange={(e) => {
          if (isNetworkId(e.target.value)) setNetworkId(e.target.value);
        }}
        className="rounded-lg border border-night-600 bg-night-800 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-glow-400 focus:ring-2 focus:ring-glow-400/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {NETWORK_IDS.map((id) => (
          <option key={id} value={id}>
            {NETWORKS[id].label}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-400">{info.description}</p>
      {info.caution && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {info.caution}
        </p>
      )}
      {locked && <p className="text-xs text-slate-500">Disconnect to change network.</p>}
    </div>
  );
}
